# EchoFlow frontend

The React and TypeScript interface for the EchoFlow voice assistant prototype. FastAPI serves the production build from `dist/` and provides the `/api` and `/ws` endpoints.

## Run in development

Start FastAPI from the project root, then open a second terminal:

```powershell
Set-Location frontend
npm ci
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` and `/ws` to `http://127.0.0.1:8000`. If FastAPI listens elsewhere, set `ECHOFLOW_BACKEND_URL` for Vite, for example:

```powershell
$env:ECHOFLOW_BACKEND_URL = 'http://127.0.0.1:8001'
npm run dev
```

## Build for FastAPI

```powershell
npm ci
npm run build
```

Then start or restart FastAPI from the project root. It serves the built site at `/`, the legacy diagnostic dashboard at `/hud`, and the compiled audio worklet at `/audio-worklet.js`.

## Voice integration

`src/voice/echoflow.tsx` owns the browser microphone, AudioWorklet PCM capture, WebSocket protocol, speech recognition, and playback. The server protocol is implemented in the project-root `server.py`. The public worklet resamples microphone audio to 16 kHz mono and posts 30 ms frames.

The assistant also supports a text-only session from the idle and error screens. It connects to the same chat service without requesting microphone permission; typed input is the fallback for browsers without speech recognition.

Speech recognition depends on the browser's `SpeechRecognition` implementation and may use a browser-selected network service. Server-side speech activity detection is a lightweight heuristic. Interruption history estimates played words from elapsed time; it is not word-level audio alignment.
