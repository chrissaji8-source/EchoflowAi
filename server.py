"""FastAPI server for the EchoFlow voice turn-taking demo."""

import asyncio
import base64
import json
import logging
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator, Dict, Optional
from urllib.parse import urlsplit

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from config import config
from engine.intent_classifier import IntentClassifier, IntentType
from engine.pipelines.cloud_pipeline import CloudPipeline
from engine.pipelines.errors import PipelineError
from engine.pipelines.local_pipeline import LocalFallbackPipeline
from engine.state_manager import DialogueStateManager
from engine.vad_engine import VADEngine


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("echoflow")

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
VOICE_PRESETS = {
    "en-IN": {
        "default": "en-IN-NeerjaNeural",
        "calm-low": "en-IN-PrabhatNeural",
        "clear-bright": "en-IN-NeerjaNeural",
    },
    "en-US": {
        "default": "en-US-JennyNeural",
        "calm-low": "en-US-GuyNeural",
        "clear-bright": "en-US-AriaNeural",
    },
    "en-GB": {
        "default": "en-GB-SoniaNeural",
        "calm-low": "en-GB-RyanNeural",
        "clear-bright": "en-GB-SoniaNeural",
    },
    "hi-IN": {
        "default": "hi-IN-SwaraNeural",
        "calm-low": "hi-IN-MadhurNeural",
        "clear-bright": "hi-IN-SwaraNeural",
    },
}
cloud_pipeline = CloudPipeline()
local_pipeline = LocalFallbackPipeline()
default_pipeline_mode = config.DEFAULT_PIPELINE_MODE
active_sessions: Dict[str, Dict[str, Any]] = {}


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await cloud_pipeline.start()
    try:
        yield
    finally:
        await cloud_pipeline.close()


app = FastAPI(title="EchoFlow Voice Turn-Taking Demo", version="2.0.0", lifespan=lifespan)


@app.get("/api/status")
async def get_status() -> Dict[str, Any]:
    ollama_available = await local_pipeline.is_ollama_available()
    provider = "groq" if config.GROQ_API_KEY else "gemini" if config.GEMINI_API_KEY else None
    return {
        "status": "ONLINE",
        "pipeline_mode": default_pipeline_mode,
        "active_sessions": len(active_sessions),
        "ollama_available": ollama_available,
        "ollama_model": config.OLLAMA_MODEL,
        "cloud_configured": provider is not None,
        "cloud_provider": provider,
        "sample_rate": config.SAMPLE_RATE,
        "frame_size_ms": config.FRAME_SIZE_MS,
        "vad_threshold": config.VAD_SPEECH_THRESHOLD,
    }


@app.post("/api/mode")
async def set_pipeline_mode(request: Request) -> JSONResponse:
    global default_pipeline_mode
    try:
        body = await request.json()
    except (json.JSONDecodeError, ValueError):
        return JSONResponse(status_code=400, content={"error": "Request body must be valid JSON."})
    if not isinstance(body, dict):
        return JSONResponse(status_code=400, content={"error": "Request body must be a JSON object."})
    new_mode = str(body.get("mode", "")).strip().lower()
    if new_mode not in {"cloud", "local"}:
        return JSONResponse(status_code=400, content={"error": "Choose 'cloud' or 'local'."})
    default_pipeline_mode = new_mode
    return JSONResponse(content={"status": "SUCCESS", "current_mode": default_pipeline_mode})


@app.websocket("/ws/audio")
async def websocket_audio_endpoint(websocket: WebSocket) -> None:
    origin = websocket.headers.get("origin")
    request_host = websocket.headers.get("host", "").lower()
    if origin and urlsplit(origin).netloc.lower() != request_host:
        await websocket.close(code=1008)
        return
    await websocket.accept()

    session_id = secrets.token_urlsafe(12)
    session_mode = default_pipeline_mode
    vad = VADEngine(sample_rate=config.SAMPLE_RATE)
    intent_classifier = IntentClassifier()
    state_manager = DialogueStateManager(session_id=session_id)
    send_lock = asyncio.Lock()

    generation_task: Optional[asyncio.Task] = None
    cancel_event: Optional[asyncio.Event] = None
    active_turn_id: Optional[str] = None
    active_request_id: Optional[str] = None
    session_locale = "en-IN"
    session_voice_id = "default"
    session_voice_name = VOICE_PRESETS[session_locale][session_voice_id]
    playback_finished = asyncio.Event()

    async def send_json(payload: Dict[str, Any]) -> None:
        async with send_lock:
            await websocket.send_json(payload)

    def cancel_generation() -> None:
        nonlocal generation_task, cancel_event, active_turn_id
        if cancel_event is not None:
            cancel_event.set()
        if generation_task is not None and not generation_task.done():
            generation_task.cancel()
        generation_task = None
        active_turn_id = None
        playback_finished.set()

    def selected_pipeline():
        return cloud_pipeline if session_mode == "cloud" else local_pipeline

    async def start_user_turn(user_text: str) -> None:
        nonlocal generation_task, cancel_event, active_request_id
        user_text = user_text.strip()
        if not user_text:
            return
        if len(user_text) > config.MAX_TRANSCRIPT_CHARS:
            await send_json({"type": "ERROR", "message": "That message is too long. Please keep it under 2,000 characters."})
            return

        # A new finalized utterance supersedes any older generation, including one
        # that is still waiting for speech synthesis or browser playback.
        previous_request_id = active_request_id if generation_task is not None and not generation_task.done() else None
        cancel_generation()
        if previous_request_id:
            await send_json({"type": "LLM_GENERATION_CANCELLED", "request_id": previous_request_id})
        state_manager.add_user_turn(user_text)
        request_id = secrets.token_urlsafe(8)
        active_request_id = request_id
        request_cancel_event = asyncio.Event()
        cancel_event = request_cancel_event
        context = state_manager.get_context_for_llm()
        pipeline = selected_pipeline()

        await send_json({"type": "USER_MESSAGE", "text": user_text, "request_id": request_id})
        await send_json({"type": "LLM_GENERATION_START", "prompt": user_text, "request_id": request_id})

        async def generate_response() -> None:
            nonlocal active_turn_id, active_request_id
            response_parts = []
            try:
                async for token in pipeline.generate_llm_stream(context, request_cancel_event):
                    if request_cancel_event.is_set():
                        return
                    response_parts.append(token)
                    await send_json({"type": "LLM_TOKEN_DELTA", "token": token, "request_id": request_id})

                response_text = "".join(response_parts).strip()
                if not response_text or request_cancel_event.is_set():
                    return

                await send_json({"type": "ASSISTANT_TEXT_READY", "text": response_text, "request_id": request_id})
                audio_parts = []
                try:
                    if pipeline is cloud_pipeline:
                        audio_stream = pipeline.generate_tts_audio_chunks(
                            response_text, request_cancel_event, voice_name=session_voice_name
                        )
                    else:
                        audio_stream = pipeline.generate_tts_audio_chunks(response_text, request_cancel_event)
                    async for audio_part in audio_stream:
                        if request_cancel_event.is_set():
                            return
                        audio_parts.append(audio_part)
                except asyncio.CancelledError:
                    raise
                except Exception as tts_error:
                    logger.warning("Speech synthesis unavailable for session %s: %s", session_id, tts_error)
                if request_cancel_event.is_set():
                    return

                state_manager.start_assistant_turn(response_text)
                turn_id = secrets.token_urlsafe(8)
                active_turn_id = turn_id
                playback_finished.clear()

                await send_json({
                    "type": "ASSISTANT_SPEAKING_START",
                    "text": response_text,
                    "request_id": request_id,
                    "turn_id": turn_id,
                    "audio_available": bool(audio_parts),
                })

                if audio_parts:
                    audio_bytes = b"".join(audio_parts)
                    await send_json({
                        "type": "ASSISTANT_AUDIO",
                        "audio_b64": base64.b64encode(audio_bytes).decode("ascii"),
                        "turn_id": turn_id,
                    })
                    timeout_seconds = min(180.0, max(30.0, len(response_text.split()) * 0.9 + 20.0))
                    try:
                        await asyncio.wait_for(playback_finished.wait(), timeout=timeout_seconds)
                    except asyncio.TimeoutError:
                        if active_turn_id == turn_id and state_manager.is_assistant_speaking:
                            rollback = state_manager.rollback_on_interrupt()
                            await send_json({"type": "PLAYBACK_TIMEOUT", "turn_id": turn_id, "rollback": rollback})
                            active_turn_id = None
                        return

                    if active_turn_id == turn_id and state_manager.is_assistant_speaking:
                        state_manager.complete_assistant_turn()
                        await send_json({"type": "ASSISTANT_SPEAKING_END", "turn_id": turn_id})
                else:
                    # The text remains usable when online or system TTS is unavailable.
                    state_manager.complete_assistant_turn()
                    await send_json({"type": "AUDIO_UNAVAILABLE", "request_id": request_id})
                    await send_json({"type": "ASSISTANT_SPEAKING_END", "turn_id": turn_id})

                if active_turn_id == turn_id:
                    active_turn_id = None
                if active_request_id == request_id:
                    active_request_id = None
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.exception("Response generation failed for session %s", session_id)
                if active_turn_id and state_manager.is_assistant_speaking:
                    state_manager.rollback_on_interrupt(0.0)
                await send_json({
                    "type": "ERROR",
                    "message": str(exc) if isinstance(exc, PipelineError) else "The response could not be generated. Check the selected provider and try again.",
                    "request_id": request_id,
                })
                if active_turn_id:
                    active_turn_id = None
                if active_request_id == request_id:
                    active_request_id = None

        generation_task = asyncio.create_task(generate_response())

    async def interrupt_and_respond(user_text: str, matched_text: str, decision_ms: Optional[float]) -> None:
        interrupted_turn_id = active_turn_id
        interrupted_request_id = active_request_id
        rollback = state_manager.rollback_on_interrupt()
        cancel_generation()
        if interrupted_request_id:
            await send_json({"type": "LLM_GENERATION_CANCELLED", "request_id": interrupted_request_id})
        await send_json({
            "type": "HARD_BARGE_IN_TRIGGERED",
            "turn_id": interrupted_turn_id,
            "matched_text": matched_text,
            "latency_ms": round(decision_ms, 3) if decision_ms is not None else None,
            "rollback": rollback,
        })
        await start_user_turn(user_text)

    active_sessions[session_id] = {"mode": session_mode, "state_manager": state_manager}
    try:
        await send_json({
            "type": "SESSION_INIT",
            "session_id": session_id,
            "mode": session_mode,
            "message": "Connected to EchoFlow.",
        })

        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break

            if message.get("text") is not None:
                if len(message["text"]) > config.MAX_CONTROL_MESSAGE_CHARS:
                    await send_json({"type": "ERROR", "message": "WebSocket control message is too large."})
                    continue
                try:
                    data = json.loads(message["text"])
                except (json.JSONDecodeError, TypeError):
                    await send_json({"type": "ERROR", "message": "Invalid JSON message."})
                    continue
                if not isinstance(data, dict):
                    await send_json({"type": "ERROR", "message": "WebSocket message must be a JSON object."})
                    continue

                message_type = data.get("type")
                if not isinstance(message_type, str):
                    await send_json({"type": "ERROR", "message": "WebSocket message type must be text."})
                    continue
                if message_type == "SET_MODE":
                    requested_mode = str(data.get("mode", "")).strip().lower()
                    if requested_mode not in {"cloud", "local"}:
                        await send_json({"type": "ERROR", "message": "Choose cloud or local mode."})
                    else:
                        session_mode = requested_mode
                        active_sessions[session_id]["mode"] = session_mode
                        await send_json({"type": "MODE_CHANGED", "mode": session_mode})

                elif message_type == "SET_VOICE":
                    requested_locale = str(data.get("locale", "en-IN"))
                    session_locale = requested_locale if requested_locale in VOICE_PRESETS else "en-IN"
                    requested_voice_id = str(data.get("voice_id", "default"))
                    session_voice_id = requested_voice_id if requested_voice_id in VOICE_PRESETS[session_locale] else "default"
                    session_voice_name = VOICE_PRESETS[session_locale][session_voice_id]
                    await send_json({"type": "VOICE_CHANGED", "voice_id": session_voice_id, "locale": session_locale})

                elif message_type == "STOP_ASSISTANT":
                    if generation_task is not None and not generation_task.done():
                        stopped_turn_id = active_turn_id
                        stopped_request_id = active_request_id
                        rollback = state_manager.rollback_on_interrupt()
                        cancel_generation()
                        active_request_id = None
                        if stopped_request_id:
                            await send_json({"type": "LLM_GENERATION_CANCELLED", "request_id": stopped_request_id})
                        await send_json({
                            "type": "ASSISTANT_STOPPED",
                            "turn_id": stopped_turn_id,
                            "request_id": stopped_request_id,
                            "rollback": rollback,
                        })

                # Older open browser tabs can keep a cached client bundle that
                # emits transcript chunks. They are interim recognition only;
                # final transcript events below are the ones that start turns.
                elif message_type == "USER_TRANSCRIPT_CHUNK":
                    continue

                elif message_type in {"USER_TEXT_INPUT", "USER_TRANSCRIPT_FINAL"}:
                    raw_user_text = data.get("text", "")
                    if not isinstance(raw_user_text, str):
                        await send_json({"type": "ERROR", "message": "Message text must be a string."})
                        continue
                    user_text = raw_user_text.strip()
                    if not user_text:
                        continue
                    if state_manager.is_assistant_speaking:
                        classification = (
                            intent_classifier.classify_text(user_text)
                            if message_type == "USER_TRANSCRIPT_FINAL"
                            else {"intent": IntentType.HARD_INTERRUPT, "matched_text": user_text, "latency_ms": None}
                        )
                        if classification["intent"] == IntentType.BACKCHANNEL:
                            await send_json({
                                "type": "BACKCHANNEL_IGNORED",
                                "matched_text": classification["matched_text"],
                                "action": "RESTORE_VOLUME",
                            })
                            continue
                        await interrupt_and_respond(
                            user_text,
                            classification["matched_text"],
                            classification["latency_ms"],
                        )
                    else:
                        await start_user_turn(user_text)

                elif message_type == "PLAYBACK_STARTED":
                    if data.get("turn_id") == active_turn_id:
                        state_manager.mark_playback_started()

                elif message_type == "PLAYBACK_FINISHED":
                    if data.get("turn_id") == active_turn_id:
                        playback_finished.set()

                elif message_type == "PLAYBACK_FAILED":
                    if data.get("turn_id") == active_turn_id:
                        state_manager.rollback_on_interrupt(0.0)
                        playback_finished.set()
                        await send_json({"type": "ERROR", "message": "The browser could not decode the speech audio."})
                        await send_json({"type": "ASSISTANT_SPEAKING_END", "turn_id": active_turn_id})
                        active_turn_id = None

                elif message_type == "SIMULATE_EVENT":
                    event_name = str(data.get("event", "")).upper()
                    if event_name == "HARD_INTERRUPT":
                        await interrupt_and_respond(
                            "Wait, make the reservation for Friday at 7 PM instead.",
                            "Wait, change the date!",
                            None,
                        )
                    elif event_name == "BACKCHANNEL":
                        await send_json({
                            "type": "BACKCHANNEL_IGNORED",
                            "matched_text": "uh-huh",
                            "action": "RESTORE_VOLUME",
                        })
                    elif event_name == "NOISE":
                        await send_json({"type": "NOISE_REJECTED", "action": "RESTORE_VOLUME"})
                    else:
                        await send_json({"type": "ERROR", "message": "Unknown simulation event."})

                else:
                    logger.warning(
                        "Unknown WebSocket message type %r for session %s",
                        message_type,
                        session_id,
                    )
                    await send_json({"type": "ERROR", "message": "Unknown WebSocket message type."})

            elif message.get("bytes") is not None:
                pcm_bytes = message["bytes"]
                if len(pcm_bytes) != config.MAX_AUDIO_FRAME_BYTES:
                    continue
                was_active = vad.is_speech_active
                is_speech, probability, latency_ms = vad.process_frame(pcm_bytes)
                if is_speech and not was_active:
                    await send_json({"type": "VAD_STATE", "active": True, "speech_prob": round(probability, 3)})
                if is_speech and not was_active and state_manager.is_assistant_speaking:
                    await send_json({
                        "type": "ACOUSTIC_DUCK_TRIGGER",
                        "speech_prob": round(probability, 3),
                        "latency_ms": round(latency_ms, 3),
                        "action": "DUCK_VOLUME",
                        "duck_ratio": config.DUCKING_VOLUME_RATIO,
                        "fade_ms": config.DUCKING_FADE_MS,
                    })
                elif was_active and not is_speech:
                    await send_json({"type": "VAD_STATE", "active": False, "speech_prob": round(probability, 3)})
                    await send_json({"type": "ACOUSTIC_DUCK_RELEASE", "fade_ms": config.DUCKING_FADE_MS})

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WebSocket session failed: %s", session_id)
    finally:
        task_to_cancel = generation_task
        cancel_generation()
        if task_to_cancel is not None and not task_to_cancel.done():
            try:
                await task_to_cancel
            except (asyncio.CancelledError, Exception):
                pass
        active_sessions.pop(session_id, None)


CADENCE_DIST = BASE_DIR / "frontend" / "dist"

@app.get("/favicon.ico")
async def favicon() -> Response:
    fav = CADENCE_DIST / "favicon.ico"
    if fav.exists():
        return FileResponse(str(fav))
    return Response(content=b"", media_type="image/x-icon")


@app.get("/style.css")
async def legacy_hud_stylesheet() -> FileResponse:
    return FileResponse(str(STATIC_DIR / "style.css"), media_type="text/css")


@app.get("/app.js")
async def legacy_hud_script() -> FileResponse:
    return FileResponse(str(STATIC_DIR / "app.js"), media_type="text/javascript")


@app.get("/audio-worklet.js")
async def audio_worklet() -> FileResponse:
    built_worklet = CADENCE_DIST / "audio-worklet.js"
    worklet = built_worklet if built_worklet.is_file() else STATIC_DIR / "audio-worklet.js"
    return FileResponse(str(worklet), media_type="text/javascript")

# Mount Cadence Assets
if (CADENCE_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(CADENCE_DIST / "assets")), name="cadence-assets")
if (CADENCE_DIST / "media").exists():
    app.mount("/media", StaticFiles(directory=str(CADENCE_DIST / "media")), name="cadence-media")

# Serve HUD Dashboard on /hud
if (STATIC_DIR / "index.html").exists():
    @app.get("/hud", response_class=HTMLResponse)
    async def serve_hud():
        return FileResponse(str(STATIC_DIR / "index.html"))

# SPA Catch-all route for Cadence
if (CADENCE_DIST / "index.html").exists():
    @app.get("/{full_path:path}", response_class=HTMLResponse)
    async def serve_spa(full_path: str):
        dist_root = CADENCE_DIST.resolve()
        file_target = (dist_root / full_path).resolve()
        try:
            file_target.relative_to(dist_root)
        except ValueError:
            return FileResponse(str(dist_root / "index.html"))
        if file_target.is_file():
            return FileResponse(str(file_target))
        return FileResponse(str(dist_root / "index.html"))
else:
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    logger.info("Starting EchoFlow on http://%s:%s", config.HOST, config.PORT)
    uvicorn.run("server:app", host=config.HOST, port=config.PORT, reload=config.DEBUG)
