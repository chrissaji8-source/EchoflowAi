"""Cloud chat and online speech synthesis providers."""

import asyncio
import json
import logging
from typing import AsyncGenerator, Dict, List

import edge_tts
import httpx

from config import config
from engine.pipelines.errors import PipelineError


RETRYABLE_STATUS_CODES = {408, 429, 500, 502, 503, 504}
logger = logging.getLogger("echoflow")


def _retry_delay(attempt: int, retry_after: str = "") -> float:
    try:
        return min(4.0, max(0.25, float(retry_after)))
    except (TypeError, ValueError):
        return min(2.0, 0.6 * (2 ** attempt))


def _provider_error_message(provider: str, status_code: int) -> str:
    if status_code in {401, 403}:
        return f"{provider} rejected the API key or project access (HTTP {status_code}). Check the key and project."
    if status_code == 429:
        return f"{provider} rate limit reached (HTTP 429). Wait a moment and try again."
    if status_code >= 500 or status_code in {408}:
        return f"{provider} is temporarily unavailable (HTTP {status_code}). Please try again shortly."
    return f"{provider} rejected the request (HTTP {status_code}). Check the selected model and settings."


class CloudPipeline:
    def __init__(self) -> None:
        self.groq_api_key = config.GROQ_API_KEY
        self.gemini_api_key = config.GEMINI_API_KEY
        self.voice_name = "en-US-JennyNeural"
        self._client: httpx.AsyncClient | None = None

    async def start(self) -> None:
        """Open a shared connection pool so follow-up turns skip repeated TLS setup."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(30.0, connect=8.0),
                limits=httpx.Limits(max_connections=40, max_keepalive_connections=20),
            )

    async def close(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            await self.start()
        return self._client

    async def generate_llm_stream(
        self, messages: List[Dict[str, str]], cancel_event: asyncio.Event
    ) -> AsyncGenerator[str, None]:
        if self.groq_api_key:
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {"Authorization": f"Bearer {self.groq_api_key}"}
            payload = {
                "model": config.GROQ_MODEL,
                "messages": messages,
                "stream": True,
                "max_tokens": config.LLM_MAX_OUTPUT_TOKENS,
                "temperature": 0.6,
            }
            client = await self._get_client()
            for attempt in range(3):
                yielded_content = False
                finish_reason = None
                try:
                    async with client.stream("POST", url, headers=headers, json=payload) as response:
                        response.raise_for_status()
                        async for line in response.aiter_lines():
                            if cancel_event.is_set():
                                return
                            if not line.startswith("data:"):
                                continue
                            data = line[5:].strip()
                            if data == "[DONE]":
                                break
                            chunk = json.loads(data)
                            choices = chunk.get("choices", [])
                            if choices:
                                finish_reason = choices[0].get("finish_reason") or finish_reason
                                delta = choices[0].get("delta", {}).get("content") or ""
                                if delta:
                                    yielded_content = True
                                    yield delta
                    if finish_reason == "length":
                        raise PipelineError(
                            f"The reply reached its {config.LLM_MAX_OUTPUT_TOKENS}-token limit and may be incomplete."
                        )
                    return
                except asyncio.CancelledError:
                    raise
                except httpx.HTTPStatusError as exc:
                    status_code = exc.response.status_code
                    if status_code in RETRYABLE_STATUS_CODES and attempt < 2 and not yielded_content:
                        await asyncio.sleep(_retry_delay(attempt, exc.response.headers.get("Retry-After", "")))
                        continue
                    raise PipelineError(_provider_error_message("Groq", status_code)) from exc
                except (httpx.HTTPError, json.JSONDecodeError, KeyError, IndexError) as exc:
                    raise PipelineError("Groq request failed. Check the provider key, model, and network.") from exc
            return

        if self.gemini_api_key:
            system_instruction = next(
                (item["content"] for item in messages if item.get("role") == "system"), None
            )
            contents = [
                {
                    "role": "model" if item["role"] == "assistant" else "user",
                    "parts": [{"text": item["content"]}],
                }
                for item in messages
                if item.get("role") != "system"
            ]
            payload = {
                "contents": contents,
                "generationConfig": {"maxOutputTokens": config.LLM_MAX_OUTPUT_TOKENS},
            }
            if system_instruction:
                payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}
            client = await self._get_client()
            models = [config.GEMINI_MODEL]
            fallback_model = config.GEMINI_FALLBACK_MODEL
            if fallback_model and fallback_model != config.GEMINI_MODEL:
                models.append(fallback_model)

            for model_index, model in enumerate(models):
                switch_to_fallback = False
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent"
                for attempt in range(3):
                    yielded_content = False
                    finish_reason = None
                    try:
                        async with client.stream(
                            "POST",
                            url,
                            params={"alt": "sse"},
                            headers={"x-goog-api-key": self.gemini_api_key},
                            json=payload,
                        ) as response:
                            response.raise_for_status()
                            async for line in response.aiter_lines():
                                if cancel_event.is_set():
                                    return
                                if not line.startswith("data:"):
                                    continue
                                data = json.loads(line[5:].strip())
                                candidates = data.get("candidates", [])
                                if candidates:
                                    finish_reason = candidates[0].get("finishReason") or finish_reason
                                    parts = candidates[0].get("content", {}).get("parts", [])
                                    for part in parts:
                                        if part.get("text"):
                                            yielded_content = True
                                            yield part["text"]
                        if finish_reason == "MAX_TOKENS":
                            raise PipelineError(
                                f"The reply reached its {config.LLM_MAX_OUTPUT_TOKENS}-token limit and may be incomplete."
                            )
                        if yielded_content:
                            return
                        if model_index + 1 < len(models):
                            logger.warning("Gemini model %s returned no text; trying fallback model %s", model, models[model_index + 1])
                            switch_to_fallback = True
                            break
                        raise PipelineError(f"Gemini model {model} returned an empty response. Please try again.")
                    except asyncio.CancelledError:
                        raise
                    except httpx.HTTPStatusError as exc:
                        status_code = exc.response.status_code
                        # Quotas can differ by model. Try the alternate model
                        # immediately on 429; repeating the same capped model
                        # only adds delay when another model may still be usable.
                        if (status_code == 429 or status_code >= 500) and model_index + 1 < len(models) and not yielded_content:
                            logger.warning(
                                "Gemini model %s returned HTTP %s; trying fallback model %s",
                                model,
                                status_code,
                                models[model_index + 1],
                            )
                            switch_to_fallback = True
                            break
                        if status_code in RETRYABLE_STATUS_CODES and attempt < 2 and not yielded_content:
                            await asyncio.sleep(_retry_delay(attempt, exc.response.headers.get("Retry-After", "")))
                            continue
                        raise PipelineError(_provider_error_message("Gemini", status_code)) from exc
                    except PipelineError:
                        raise
                    except (httpx.HTTPError, json.JSONDecodeError, KeyError, IndexError) as exc:
                        raise PipelineError("Gemini request failed. Check the provider key, model, and network.") from exc
                if switch_to_fallback:
                    continue
                return
            return

        # Keep the no-key demo deterministic and clearly label it as a canned response.
        last_user_message = next(
            (item["content"].strip() for item in reversed(messages) if item.get("role") == "user"),
            "",
        )
        response = (
            f"This is the no-key demo response. I heard: {last_user_message[:300]}. "
            "Add a Groq or Gemini API key to enable a cloud language model."
        )
        for word in response.split():
            if cancel_event.is_set():
                return
            await asyncio.sleep(0.025)
            yield word + " "

    async def generate_tts_audio_chunks(
        self, text: str, cancel_event: asyncio.Event, voice_name: str | None = None
    ) -> AsyncGenerator[bytes, None]:
        """Collect complete MP3 data so the browser decodes one valid audio file."""
        if not text.strip() or cancel_event.is_set():
            return
        audio_parts = []
        try:
            communicate = edge_tts.Communicate(text, voice_name or self.voice_name)
            async for chunk in communicate.stream():
                if cancel_event.is_set():
                    return
                if chunk.get("type") == "audio":
                    audio_parts.append(chunk["data"])
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            raise RuntimeError("Online speech synthesis failed. Check network access or switch to Local mode.") from exc
        if audio_parts and not cancel_event.is_set():
            yield b"".join(audio_parts)

    async def transcribe_audio(self, wav_bytes: bytes, prompt: str = "EchoFlow AI voice assistant") -> str:
        """Transcribe PCM/WAV speech using ultra-fast Groq Whisper API (<150ms latency)."""
        if not self.groq_api_key or not wav_bytes:
            return ""
        client = await self._get_client()
        headers = {"Authorization": f"Bearer {self.groq_api_key}"}
        files = {"file": ("audio.wav", wav_bytes, "audio/wav")}
        data = {
            "model": "whisper-large-v3-turbo",
            "response_format": "json",
            "temperature": "0.0",
            "prompt": prompt,
        }
        try:
            response = await client.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers=headers,
                files=files,
                data=data,
                timeout=12.0,
            )
            if response.status_code == 200:
                result = response.json()
                text = str(result.get("text", "")).strip()
                # Filter out all Whisper hallucinations on background noise/silence
                t = text.lower().strip().rstrip(".!?,")
                
                # Check for bracketed audio subtitle artifacts (e.g. [Music], (applause))
                if (t.startswith("[") and t.endswith("]")) or (t.startswith("(") and t.endswith(")")):
                    logger.debug("Filtered Whisper subtitle tag: %r", text)
                    return ""
                
                # Phrases that Whisper generates from ambient room hiss / silence
                silence_phrases = {
                    "thank you", "thanks", "thank you for watching", "thanks for watching",
                    "thank you very much", "thank you so much", "bye", "goodbye",
                    "you", "subscribe", "like and subscribe", "subtitles", "silence",
                    "mbc 뉴스", "시청해 주셔서 감사합니다", "subtitles by", "translated by",
                    "the end", "peace", "y'all", "uh", "um", "oh", "ah", "okay",
                }
                if t in silence_phrases or any(t.startswith(p) and len(t.split()) <= 3 for p in ["thank you", "thanks for", "bye"]):
                    logger.debug("Filtered Whisper silence hallucination: %r", text)
                    return ""
                if len(t) <= 1:
                    return ""
                logger.info("Groq Whisper transcribed: %r", text)
                return text
            else:
                logger.warning("Groq Whisper API returned %s: %s", response.status_code, response.text)
        except Exception as exc:
            logger.warning("Server-side Whisper transcription failed: %s", exc)
        return ""

