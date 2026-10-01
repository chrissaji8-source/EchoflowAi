"use strict";

let ws = null;
let reconnectTimer = null;
let reconnectDelayMs = 1000;
let audioCtx = null;
let micStream = null;
let micSource = null;
let micAnalyser = null;
let assistantAnalyser = null;
let assistantGainNode = null;
let captureNode = null;
let captureMute = null;
let recognition = null;
let isMicActive = false;
let isConnectingMic = false;
let currentAudioSource = null;
let currentAudioTurnId = null;
let pendingAudioTurnId = null;
let currentMode = "cloud";
let drawScheduled = false;
const assistantMessages = new Map();
const cancelledAudioTurns = new Set();

const wsStatus = document.getElementById("wsStatus");
const wsStatusText = document.getElementById("wsStatusText");
const userVadBadge = document.getElementById("userVadBadge");
const duckBadge = document.getElementById("duckBadge");
const valTti = document.getElementById("valTti");
const metricState = document.getElementById("metricState");
const metricIntentSub = document.getElementById("metricIntentSub");
const conversationBox = document.getElementById("conversationBox");
const btnMicToggle = document.getElementById("btnMicToggle");
const micBtnText = document.getElementById("micBtnText");
const userCanvas = document.getElementById("userCanvas");
const assistantCanvas = document.getElementById("assistantCanvas");
const userCtx = userCanvas.getContext("2d");
const assistantCtx = assistantCanvas.getContext("2d");

function sendJson(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
        return true;
    }
    setState("DISCONNECTED", "Reconnect to send a message.");
    return false;
}

function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/audio`);
    ws.onopen = () => {
        reconnectDelayMs = 1000;
        wsStatus.className = "status-chip online";
        wsStatusText.textContent = "CONNECTED";
    };
    ws.onclose = () => {
        flushAudioBuffer();
        wsStatus.className = "status-chip offline";
        wsStatusText.textContent = "RECONNECTING";
        if (!reconnectTimer) {
            reconnectTimer = window.setTimeout(() => {
                reconnectTimer = null;
                connectWebSocket();
            }, reconnectDelayMs);
            reconnectDelayMs = Math.min(reconnectDelayMs * 1.7, 10000);
        }
    };
    ws.onerror = () => {
        wsStatus.className = "status-chip offline";
        wsStatusText.textContent = "CONNECTION ERROR";
    };
    ws.onmessage = (event) => {
        try {
            handleServerMessage(JSON.parse(event.data));
        } catch (error) {
            console.error("Invalid server message:", error);
        }
    };
}

function handleServerMessage(message) {
    switch (message.type) {
        case "SESSION_INIT":
            setModeButtons(message.mode);
            break;
        case "MODE_CHANGED":
            currentMode = message.mode;
            setModeButtons(currentMode);
            addSystemMessage(`Using ${currentMode} mode for this connection.`);
            break;
        case "USER_MESSAGE":
            appendMessage("user", message.text);
            break;
        case "LLM_GENERATION_START": {
            const node = appendMessage("assistant", "Thinking…");
            node.dataset.requestId = message.request_id;
            assistantMessages.set(message.request_id, node);
            setState("THINKING", "Generating a reply");
            break;
        }
        case "LLM_TOKEN_DELTA": {
            const node = assistantMessages.get(message.request_id);
            if (node) {
                const text = node.querySelector(".msg-text");
                if (text.textContent === "Thinking…") text.textContent = "";
                text.textContent += message.token;
                conversationBox.scrollTop = conversationBox.scrollHeight;
            }
            break;
        }
        case "LLM_GENERATION_CANCELLED": {
            const node = assistantMessages.get(message.request_id);
            if (node) {
                node.querySelector(".msg-text").textContent = "Generation cancelled by a newer message.";
                assistantMessages.delete(message.request_id);
            }
            break;
        }
        case "ASSISTANT_TEXT_READY": {
            const node = assistantMessages.get(message.request_id);
            if (node) node.querySelector(".msg-text").textContent = message.text;
            break;
        }
        case "ASSISTANT_SPEAKING_START": {
            const node = assistantMessages.get(message.request_id) || appendMessage("assistant", message.text);
            node.querySelector(".msg-text").textContent = message.text;
            if (message.audio_available) {
                setState("SPEAKING", "Reply audio is ready");
                setGain(1, 0.03);
            } else {
                setState("TEXT REPLY", "Speech output is unavailable");
            }
            break;
        }
        case "ASSISTANT_AUDIO":
            playAudio(message.audio_b64, message.turn_id);
            break;
        case "ASSISTANT_SPEAKING_END":
            if (currentAudioTurnId === message.turn_id) flushAudioBuffer();
            setState("LISTENING", "Turn completed");
            duckBadge.textContent = "GAIN: 100%";
            duckBadge.classList.remove("ducked");
            break;
        case "AUDIO_UNAVAILABLE":
            addSystemMessage("The reply is shown as text because speech synthesis is unavailable.");
            break;
        case "ACOUSTIC_DUCK_TRIGGER":
            setGain(Number(message.duck_ratio) || 0.15, Number(message.fade_ms) || 30);
            duckBadge.textContent = "DUCKED";
            duckBadge.classList.add("ducked");
            setState("DUCKING", `VAD score ${Math.round((message.speech_prob || 0) * 100)}%`);
            break;
        case "ACOUSTIC_DUCK_RELEASE":
            setGain(1, Number(message.fade_ms) || 30);
            duckBadge.textContent = "GAIN: 100%";
            duckBadge.classList.remove("ducked");
            break;
        case "VAD_STATE":
            userVadBadge.textContent = message.active ? "VAD: SPEECH" : (isMicActive ? "MIC ACTIVE" : "VAD: SILENT");
            userVadBadge.classList.toggle("active", Boolean(message.active));
            break;
        case "HARD_BARGE_IN_TRIGGERED":
            if (message.turn_id) {
                cancelledAudioTurns.add(message.turn_id);
                if (cancelledAudioTurns.size > 100) cancelledAudioTurns.delete(cancelledAudioTurns.values().next().value);
            }
            flushAudioBuffer();
            valTti.textContent = message.latency_ms == null ? "—" : Number(message.latency_ms).toFixed(2);
            setState("INTERRUPTED", `Matched: “${message.matched_text || "speech"}”`);
            duckBadge.textContent = "PLAYBACK STOPPED";
            duckBadge.classList.remove("ducked");
            if (message.rollback && message.rollback.status === "ROLLED_BACK") {
                updateLastAssistantMessageRollback(message.rollback.truncated_text);
            }
            break;
        case "BACKCHANNEL_IGNORED":
            setGain(1, 50);
            duckBadge.textContent = "GAIN: 100%";
            duckBadge.classList.remove("ducked");
            setState("BACKCHANNEL", `Kept speaking after “${message.matched_text}”`);
            break;
        case "NOISE_REJECTED":
            setGain(1, 50);
            duckBadge.textContent = "GAIN: 100%";
            duckBadge.classList.remove("ducked");
            setState("NOISE EVENT", "Demo event ignored");
            break;
        case "PLAYBACK_TIMEOUT":
            flushAudioBuffer();
            updateLastAssistantMessageRollback(message.rollback?.truncated_text || "Playback timed out.");
            setState("PLAYBACK ENDED", "The browser did not report playback completion");
            break;
        case "ERROR":
            addSystemMessage(message.message || "Something went wrong.");
            if (message.request_id && assistantMessages.has(message.request_id)) {
                const reply = assistantMessages.get(message.request_id).querySelector(".msg-text");
                if (!reply.textContent || reply.textContent === "Thinking…") reply.textContent = "Reply unavailable.";
            }
            setState("ERROR", message.message || "Request failed");
            break;
        default:
            break;
    }
}

function setState(state, detail) {
    metricState.textContent = state;
    metricIntentSub.textContent = detail || "";
}

function setModeButtons(mode) {
    currentMode = mode === "local" ? "local" : "cloud";
    document.getElementById("btnModeCloud").classList.toggle("active", currentMode === "cloud");
    document.getElementById("btnModeLocal").classList.toggle("active", currentMode === "local");
}

async function initAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error("This browser does not support the Web Audio API.");
        audioCtx = new AudioContextClass();
        assistantGainNode = audioCtx.createGain();
        assistantAnalyser = audioCtx.createAnalyser();
        assistantAnalyser.fftSize = 256;
        assistantGainNode.connect(assistantAnalyser);
        assistantAnalyser.connect(audioCtx.destination);
        resizeCanvases();
    }
    if (audioCtx.state === "suspended") await audioCtx.resume();
}

async function toggleMicrophone() {
    if (isConnectingMic) return;
    if (isMicActive) {
        stopMicrophone();
        return;
    }
    await startMicrophone();
}

async function startMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) {
        addSystemMessage("Microphone capture requires HTTPS or localhost in a supported browser.");
        return;
    }
    isConnectingMic = true;
    btnMicToggle.disabled = true;
    try {
        await initAudioContext();
        micStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
        });
        micSource = audioCtx.createMediaStreamSource(micStream);
        micAnalyser = audioCtx.createAnalyser();
        micAnalyser.fftSize = 256;
        micSource.connect(micAnalyser);

        if (!audioCtx.audioWorklet) throw new Error("AudioWorklet is not available in this browser.");
        await audioCtx.audioWorklet.addModule(new URL("audio-worklet.js", window.location.href));
        captureNode = new AudioWorkletNode(audioCtx, "echoflow-pcm-capture", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [1],
            channelCount: 1
        });
        captureMute = audioCtx.createGain();
        captureMute.gain.value = 0;
        captureNode.port.onmessage = (event) => {
            if (ws && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 96 * 1024) {
                ws.send(event.data);
            }
        };
        micAnalyser.connect(captureNode);
        captureNode.connect(captureMute);
        captureMute.connect(audioCtx.destination);

        isMicActive = true;
        btnMicToggle.classList.add("active");
        micBtnText.textContent = "Stop Voice";
        userVadBadge.textContent = "MIC ACTIVE";
        startSpeechRecognition();
    } catch (error) {
        console.error("Microphone setup failed:", error);
        addSystemMessage(error.message || "Microphone access could not be started.");
        stopMicrophone();
    } finally {
        isConnectingMic = false;
        btnMicToggle.disabled = false;
    }
}

function startSpeechRecognition() {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
        addSystemMessage("Live transcription is not supported here. You can still use the text box; VAD remains active.");
        return;
    }
    recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            if (!result.isFinal) continue;
            let transcript = result[0]?.transcript?.trim();
            if (transcript) {
                transcript = transcript
                    .replace(/\b(for low air|flow air|slow ar|slow air|echo floor|echo blow|a flow ai|eco flow)\b/gi, 'EchoFlow AI')
                    .replace(/\b(echo flow)\b/gi, 'EchoFlow');
                sendJson({ type: "USER_TRANSCRIPT_FINAL", text: transcript });
            }
        }
    };
    recognition.onerror = (event) => {
        if (event.error !== "no-speech" && event.error !== "aborted") {
            setState("TRANSCRIPTION", `Browser speech recognition: ${event.error}`);
        }
    };
    recognition.onend = () => {
        if (isMicActive && recognition) {
            window.setTimeout(() => {
                if (!isMicActive || !recognition) return;
                try { recognition.start(); } catch (_) { /* already restarting */ }
            }, 250);
        }
    };
    try {
        recognition.start();
    } catch (error) {
        addSystemMessage("Browser speech recognition could not start. Text input is still available.");
    }
}

function stopMicrophone() {
    isMicActive = false;
    if (recognition) {
        recognition.onend = null;
        try { recognition.stop(); } catch (_) { /* recognition may not have started */ }
        recognition = null;
    }
    if (captureNode) {
        captureNode.port.onmessage = null;
        captureNode.disconnect();
        captureNode = null;
    }
    if (captureMute) {
        captureMute.disconnect();
        captureMute = null;
    }
    if (micSource) {
        micSource.disconnect();
        micSource = null;
    }
    if (micAnalyser) {
        micAnalyser.disconnect();
        micAnalyser = null;
    }
    if (micStream) {
        micStream.getTracks().forEach((track) => track.stop());
        micStream = null;
    }
    btnMicToggle.classList.remove("active");
    micBtnText.textContent = "Start Live Voice";
    userVadBadge.textContent = "VAD: SILENT";
    userVadBadge.classList.remove("active");
}

async function playAudio(encodedAudio, turnId) {
    if (cancelledAudioTurns.has(turnId)) return;
    pendingAudioTurnId = turnId;
    try {
        await initAudioContext();
        const binary = atob(encodedAudio);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        const buffer = await audioCtx.decodeAudioData(bytes.buffer);
        if (pendingAudioTurnId !== turnId || cancelledAudioTurns.has(turnId)) return;
        if (currentAudioSource) flushAudioBuffer();
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(assistantGainNode);
        currentAudioSource = source;
        currentAudioTurnId = turnId;
        pendingAudioTurnId = null;
        source.onended = () => {
            if (currentAudioSource !== source || currentAudioTurnId !== turnId) return;
            currentAudioSource = null;
            currentAudioTurnId = null;
            source.onended = null;
            source.disconnect();
            sendJson({ type: "PLAYBACK_FINISHED", turn_id: turnId });
        };
        source.start(audioCtx.currentTime + 0.02);
        sendJson({ type: "PLAYBACK_STARTED", turn_id: turnId });
    } catch (error) {
        if (pendingAudioTurnId !== turnId || cancelledAudioTurns.has(turnId)) return;
        pendingAudioTurnId = null;
        console.error("Audio decode or playback failed:", error);
        sendJson({ type: "PLAYBACK_FAILED", turn_id: turnId });
    }
}

function flushAudioBuffer() {
    const oldSource = currentAudioSource;
    currentAudioTurnId = null;
    pendingAudioTurnId = null;
    currentAudioSource = null;
    if (oldSource) {
        const fadeEnd = audioCtx ? audioCtx.currentTime + 0.012 : 0;
        if (assistantGainNode && audioCtx) {
            const gain = assistantGainNode.gain;
            gain.cancelScheduledValues(audioCtx.currentTime);
            gain.setValueAtTime(gain.value, audioCtx.currentTime);
            gain.linearRampToValueAtTime(0, fadeEnd);
        }
        oldSource.onended = () => oldSource.disconnect();
        try { oldSource.stop(fadeEnd); } catch (_) { oldSource.disconnect(); }
    }
}

function setGain(value, fadeMs) {
    if (!assistantGainNode || !audioCtx) return;
    const parameter = assistantGainNode.gain;
    const now = audioCtx.currentTime;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(parameter.value, now);
    parameter.linearRampToValueAtTime(value, now + Math.max(0, fadeMs) / 1000);
}

function resizeCanvases() {
    const ratio = window.devicePixelRatio || 1;
    for (const canvas of [userCanvas, assistantCanvas]) {
        const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
        const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
    }
}

function drawSpectrum(canvas, context, analyser, color) {
    context.fillStyle = "#0a0d14";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const gap = Math.max(1, Math.floor(canvas.width / 360));
    const barWidth = Math.max(1, (canvas.width - (data.length - 1) * gap) / data.length);
    let x = 0;
    context.fillStyle = color;
    for (const value of data) {
        const height = Math.max(1, (value / 255) * canvas.height);
        context.fillRect(x, canvas.height - height, barWidth, height);
        x += barWidth + gap;
    }
}

function renderWaveforms() {
    if (drawScheduled) return;
    drawScheduled = true;
    requestAnimationFrame(() => {
        drawScheduled = false;
        drawSpectrum(userCanvas, userCtx, micAnalyser, "#00f0ff");
        drawSpectrum(assistantCanvas, assistantCtx, assistantAnalyser, "#9d4edd");
        renderWaveforms();
    });
}

function appendMessage(role, text) {
    const message = document.createElement("div");
    message.className = `message ${role}-msg`;
    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    const label = document.createElement("strong");
    label.textContent = role === "user" ? "You: " : "EchoFlow: ";
    const content = document.createElement("span");
    content.className = "msg-text";
    content.textContent = text;
    bubble.append(label, content);
    message.appendChild(bubble);
    conversationBox.appendChild(message);
    while (conversationBox.children.length > 120) {
        const removed = conversationBox.firstElementChild;
        if (removed?.dataset.requestId) assistantMessages.delete(removed.dataset.requestId);
        removed?.remove();
    }
    conversationBox.scrollTop = conversationBox.scrollHeight;
    return message;
}

function addSystemMessage(text) {
    const message = document.createElement("div");
    message.className = "message system-msg";
    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.textContent = text;
    message.appendChild(bubble);
    conversationBox.appendChild(message);
    conversationBox.scrollTop = conversationBox.scrollHeight;
}

function updateLastAssistantMessageRollback(text) {
    const messages = conversationBox.querySelectorAll(".assistant-msg");
    if (!messages.length) return;
    const content = messages[messages.length - 1].querySelector(".msg-text");
    content.textContent = text || "Assistant playback was interrupted.";
    const tag = document.createElement("span");
    tag.className = "rollback-tag";
    tag.textContent = "Estimated from playback duration";
    content.append(document.createElement("br"), tag);
}

function clearConversation() {
    conversationBox.replaceChildren();
    assistantMessages.clear();
    addSystemMessage("Display cleared. The active server conversation remains in memory until you reconnect.");
}

function sendCustomText() {
    const input = document.getElementById("customInput");
    const text = input.value.trim();
    if (!text) return;
    void initAudioContext().catch(() => {});
    if (sendJson({ type: "USER_TEXT_INPUT", text })) input.value = "";
}

function handleKey(event) {
    if (event.key === "Enter") {
        event.preventDefault();
        sendCustomText();
    }
}

function simulateEvent(eventType) {
    void initAudioContext().catch(() => {});
    sendJson({ type: "SIMULATE_EVENT", event: eventType });
}

function switchMode(mode) {
    if (!sendJson({ type: "SET_MODE", mode })) return;
    document.getElementById("btnModeCloud").disabled = true;
    document.getElementById("btnModeLocal").disabled = true;
    window.setTimeout(() => {
        document.getElementById("btnModeCloud").disabled = false;
        document.getElementById("btnModeLocal").disabled = false;
    }, 600);
}

window.addEventListener("DOMContentLoaded", () => {
    connectWebSocket();
    renderWaveforms();
    if ("ResizeObserver" in window) {
        new ResizeObserver(resizeCanvases).observe(document.querySelector(".visualizer-container"));
    }
    window.addEventListener("resize", resizeCanvases);
    resizeCanvases();
});
