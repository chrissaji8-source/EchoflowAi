"""Application settings loaded from environment variables and an optional .env file."""

import os
from dotenv import load_dotenv

load_dotenv()


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Config:
    # Bind to loopback by default. Set HOST explicitly to expose the demo on a network.
    HOST = os.getenv("HOST", "127.0.0.1")
    PORT = int(os.getenv("PORT", "8000"))
    DEBUG = _bool_env("DEBUG", False)

    DEFAULT_PIPELINE_MODE = os.getenv("PIPELINE_MODE", "cloud").strip().lower()

    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
    GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip()
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite").strip()
    GEMINI_FALLBACK_MODEL = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.6-flash").strip()
    LLM_MAX_OUTPUT_TOKENS = int(os.getenv("LLM_MAX_OUTPUT_TOKENS", "1024"))

    OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2").strip()

    SAMPLE_RATE = 16000
    CHANNELS = 1
    FRAME_SIZE_MS = 30
    VAD_SPEECH_THRESHOLD = float(os.getenv("VAD_SPEECH_THRESHOLD", "0.65"))
    DUCKING_VOLUME_RATIO = float(os.getenv("DUCKING_VOLUME_RATIO", "0.15"))
    DUCKING_FADE_MS = 30
    MAX_TRANSCRIPT_CHARS = 2000
    MAX_CONTROL_MESSAGE_CHARS = 9000
    MAX_AUDIO_FRAME_BYTES = SAMPLE_RATE * FRAME_SIZE_MS // 1000 * 2


config = Config()

if config.DEFAULT_PIPELINE_MODE not in {"cloud", "local"}:
    raise ValueError("PIPELINE_MODE must be 'cloud' or 'local'.")
if config.PORT < 1 or config.PORT > 65535:
    raise ValueError("PORT must be between 1 and 65535.")
if not 64 <= config.LLM_MAX_OUTPUT_TOKENS <= 8192:
    raise ValueError("LLM_MAX_OUTPUT_TOKENS must be between 64 and 8192.")
if not 0.0 < config.VAD_SPEECH_THRESHOLD <= 1.0:
    raise ValueError("VAD_SPEECH_THRESHOLD must be greater than 0 and at most 1.")
if not 0.0 <= config.DUCKING_VOLUME_RATIO <= 1.0:
    raise ValueError("DUCKING_VOLUME_RATIO must be between 0 and 1.")
