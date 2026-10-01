# EchoFlow Voice Lab

EchoFlow is a small FastAPI and browser demo for voice activity detection, transcript-based turn-taking, and interruptible speech playback. It is an experimental prototype, not a production voice platform.

## What the demo does

- Captures mono microphone audio in the browser and sends 16 kHz PCM frames to a per-connection VAD.
- Uses the browser's Speech Recognition API, when available, to send finalized transcripts to the server.
- Classifies a finalized transcript during assistant playback as a backchannel or an interruption using phrase rules.
- Streams chat tokens from Groq, Gemini, or Ollama; without a configured chat model it uses a small deterministic demo response.
- Synthesizes cloud-mode speech with Edge TTS, and local-mode speech with `pyttsx3` and the operating system's installed voices.
- Stops current browser playback when an interruption is received and records an approximate amount of assistant text as conversation context.

## Known limitations

- Transcription is supplied by browser `SpeechRecognition`; browser support and whether recognition uses a network service vary. Local mode does not make transcription offline.
- The assistant's text field works without microphone permission. Spoken input still needs browser `SpeechRecognition`; the server VAD detects activity but does not transcribe audio.
- The VAD is a lightweight energy and spectrum heuristic. It is not a trained speech model and may react poorly to noisy rooms or quiet speech.
- The intent classifier is a rule-based transcript heuristic. It does not understand prosody and can mistake a short request for a backchannel, or the reverse.
- Assistant audio is synthesized as a complete file before playback. It is not low-latency streaming TTS.
- Interruption history estimates words from elapsed playback time and a nominal speaking rate. It is not word-level speech alignment and should not be treated as exact transcript rollback.
- Browser echo cancellation is requested as a microphone constraint. The browser and device decide whether and how to apply it; EchoFlow does not measure echo suppression.
- Cloud mode sends conversation text to the configured LLM provider and sends the reply text to Edge TTS. Browser speech recognition may send microphone audio to a browser-selected recognition service, including while the app is in Local mode.
- The demo does not claim a particular interruption latency or classification accuracy. The displayed intent time is only the server's classifier execution time.
- Local chat is only truly model-backed when the configured Ollama model is installed and running. Otherwise a simple rule-based response is used. Local speech requires a working `pyttsx3` installation and a system voice.

## Requirements

- Python 3.10 or newer.
- A modern browser. Microphone capture requires `localhost` or HTTPS and user permission.
- For cloud chat: a Groq or Gemini API key. If both are configured, Groq is selected.
- Gemini switches to `GEMINI_FALLBACK_MODEL` (default `gemini-3.6-flash`) when the primary model returns HTTP 429/5xx or no text. Project-wide quota exhaustion can still affect both models.
- LLM output is capped at 1,024 tokens by default. Change `LLM_MAX_OUTPUT_TOKENS` in `.env` (64–8,192) if needed; the app reports a provider token-limit ending instead of silently presenting it as a complete answer.
- EchoFlow has no live weather or web lookup integration, so it tells you when a question needs current external information instead of guessing.
- For local chat: Ollama and the configured model (default `llama3.2`).
- For local speech: `pyttsx3` and an installed system voice. Cloud speech uses Edge TTS and needs network access.

## Install and run

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
Set-Location frontend
npm ci
npm run build
Set-Location ..
python server.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). Build the React app before starting FastAPI; the generated `frontend/dist` folder is ignored by Git and is served by the backend. The server binds to loopback by default. It has no authentication; do not expose it to an untrusted network. To change cloud credentials, edit `.env` and restart the server.

For frontend development, keep FastAPI running in one terminal, then run `npm run dev` from `frontend` in another and open [http://localhost:5173](http://localhost:5173). Vite proxies `/api` and `/ws` to `127.0.0.1:8000`. If the backend uses another address or port, set `ECHOFLOW_BACKEND_URL` for the Vite process (for example, `http://127.0.0.1:8001`).

## Configure cloud chat

Set one provider key in `.env`:

```dotenv
GROQ_API_KEY=your_key_here
# Or use Gemini instead:
GEMINI_API_KEY=your_key_here
# Optional model settings; a fallback is used after Gemini server errors.
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODEL=gemini-3.6-flash
```

Without a cloud key, cloud mode returns a deterministic demo response. Cloud mode still uses Edge TTS for audio, which requires network access.

## Configure local mode

Install and start Ollama, then install the configured model:

```powershell
ollama pull llama3.2
```

Select **Local** in the dashboard. EchoFlow checks that Ollama and the configured model are available. If not, it uses its built-in rule-based response. Local speech is synthesized through `pyttsx3`; it does not fall back to Edge TTS.

## Using the dashboard

1. Type a prompt on the assistant screen without enabling the microphone, or select **Start conversation** and grant microphone access for voice mode.
2. The microphone spectrum and server VAD update while PCM frames arrive. If browser speech recognition is supported, finalized transcripts start turns.
3. While audio plays, a transcript classified as an interruption stops the browser audio source. An exact configured acknowledgement phrase is treated as a backchannel.
4. The demo buttons send fixed events. They are useful for exercising UI states, but do not benchmark real speech, noise, or end-to-end latency.

The **Clear view** button clears only the messages shown in the browser. Reconnecting creates a new server session and clears its in-memory conversation history.

## Project layout

```text
server.py                    FastAPI HTTP and WebSocket endpoints
config.py                    Environment configuration and validation
engine/audio_dsp.py          PCM conversion and small DSP helpers
engine/vad_engine.py         Lightweight acoustic activity heuristic
engine/intent_classifier.py  Transcript phrase classifier
engine/state_manager.py      Per-session context and approximate playback history
engine/pipelines/            Groq/Gemini/Edge TTS and Ollama/system TTS
static/                      Legacy HUD dashboard and PCM capture worklet
frontend/                    React site, assistant UI, and browser audio worklet
benchmark.py                 Local diagnostic script
```

## Diagnostics

`python benchmark.py` runs the standalone diagnostic script. Its results are synthetic and machine-dependent; they do not establish real-world VAD accuracy, interruption accuracy, playback latency, or speech alignment. The diagnostics are not a substitute for testing with your target browser, microphone, speakers, and room.
