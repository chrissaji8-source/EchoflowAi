"""Ollama chat and operating-system speech synthesis for local mode."""

import asyncio
import json
import os
import tempfile
from typing import AsyncGenerator, Dict, List

import httpx

from config import config
from engine.pipelines.errors import PipelineError


class LocalFallbackPipeline:
    def __init__(self) -> None:
        self.ollama_base_url = config.OLLAMA_BASE_URL
        self.ollama_model = config.OLLAMA_MODEL

    async def is_ollama_available(self) -> bool:
        """Return true only when Ollama is up and the selected model is installed."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.ollama_base_url}/api/tags")
                response.raise_for_status()
                models = response.json().get("models", [])
                available_names = {item.get("name", "") for item in models}
                return self.ollama_model in available_names or any(
                    name.split(":", 1)[0] == self.ollama_model for name in available_names
                )
        except (httpx.HTTPError, ValueError, TypeError):
            return False

    async def generate_llm_stream(
        self, messages: List[Dict[str, str]], cancel_event: asyncio.Event
    ) -> AsyncGenerator[str, None]:
        if await self.is_ollama_available():
            payload = {
                "model": self.ollama_model,
                "messages": messages,
                "stream": True,
                "options": {"temperature": 0.5, "num_predict": config.LLM_MAX_OUTPUT_TOKENS},
            }
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
                    async with client.stream(
                        "POST", f"{self.ollama_base_url}/api/chat", json=payload
                    ) as response:
                        response.raise_for_status()
                        async for line in response.aiter_lines():
                            if cancel_event.is_set():
                                return
                            if not line:
                                continue
                            data = json.loads(line)
                            token = data.get("message", {}).get("content", "")
                            if token:
                                yield token
            except asyncio.CancelledError:
                raise
            except (httpx.HTTPError, json.JSONDecodeError, KeyError, TypeError) as exc:
                raise PipelineError("Ollama request failed. Check that the selected model is installed and running.") from exc
            return

        # This small rule-based fallback is offline, but it is not a language model.
        last_user = next(
            (item["content"].strip() for item in reversed(messages) if item.get("role") == "user"),
            "",
        )
        if any(term in last_user.lower() for term in ("option", "flight", "book", "reservation")):
            response = "I have your updated request. What date and time would you like me to use?"
        elif any(greeting in last_user.lower().split() for greeting in ("hello", "hi", "hey")):
            response = "Hello! Local demo mode is ready. How can I help?"
        else:
            response = f"I heard: {last_user[:250]}. The local demo fallback is active; install the configured Ollama model for local language-model replies."
        for word in response.split():
            if cancel_event.is_set():
                return
            await asyncio.sleep(0.02)
            yield word + " "

    @staticmethod
    def _synthesize_wav(text: str) -> bytes:
        import pyttsx3

        descriptor, path = tempfile.mkstemp(prefix="echoflow-", suffix=".wav")
        os.close(descriptor)
        try:
            engine = pyttsx3.init()
            engine.save_to_file(text, path)
            engine.runAndWait()
            with open(path, "rb") as audio_file:
                audio_data = audio_file.read()
            if not audio_data:
                raise RuntimeError("The local speech engine returned an empty audio file.")
            return audio_data
        finally:
            try:
                os.remove(path)
            except OSError:
                pass

    async def generate_tts_audio_chunks(
        self, text: str, cancel_event: asyncio.Event
    ) -> AsyncGenerator[bytes, None]:
        """Use pyttsx3 only; this local-mode speech path makes no network request."""
        if not text.strip() or cancel_event.is_set():
            return
        try:
            audio_data = await asyncio.to_thread(self._synthesize_wav, text)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            raise RuntimeError("Local speech synthesis is unavailable. Install pyttsx3 and a system voice.") from exc
        if not cancel_event.is_set():
            yield audio_data
