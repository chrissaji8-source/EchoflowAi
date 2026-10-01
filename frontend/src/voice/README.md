# Voice session

The `/assistant` page renders a `VoiceSession` and calls its `actions`. The live provider is `echoflow.tsx`; it connects this UI to the FastAPI WebSocket in the project root.

## Live flow

- Start requests microphone permission, creates an AudioWorklet capture graph, connects to `/ws/audio`, and starts browser `SpeechRecognition` when the browser supports it.
- The worklet resamples microphone audio to 16 kHz mono and sends 30 ms PCM frames for server-side speech activity detection.
- Only finalized browser transcripts and typed messages start conversation turns. Interim transcripts are not sent to the server.
- Assistant audio is decoded and played through Web Audio. Playback start, finish, failure, and stop events are reported to the server so it can update the session state.
- Mute disables the microphone track and stops browser recognition. End and connection failure release the microphone, audio graph, recognition instance, and socket.

## Session contract

`session.tsx` defines the `VoiceSession` and `VoiceActions` consumed by the page. `types.ts` contains the UI states and the optional `VoiceTransport` reference contract; the live provider currently implements the protocol directly rather than using that abstraction.

The provider appends turns when the server reports `USER_MESSAGE`. `turns[].text` is the full text accumulated so far, and `levels` is mutated in place for the canvas meter.

## Preview mock

`preview.tsx` is a separate scripted provider for reviewing UI states. It is not wired into `App.tsx` and does not access the microphone, network, or audio devices.

## Limits

Browser speech recognition support and processing vary by browser. Echo cancellation is requested as a browser constraint. The server VAD is a lightweight heuristic, and interrupted-word recovery is estimated from playback time rather than aligned to audio.
