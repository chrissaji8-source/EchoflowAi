import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { VoiceSessionContext, type VoiceLevels, type VoiceSession } from './session'
import type {
  ConnectionState,
  MicPermission,
  TranscriptTurn,
  VoiceEndReason,
  VoiceError,
  VoicePhase,
  VoiceSessionConfig,
} from './types'

const MAX_MESSAGE_CHARS = 2000

function getMicError(error: unknown): VoiceError {
  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message : ''
  if (!window.isSecureContext) {
    return { code: 'insecure-context', message: 'Microphone access needs localhost or a secure HTTPS connection.', recoverable: false }
  }
  if (message.includes('AudioWorklet') || message.includes('AudioContext') || message.includes('not available in this browser')) {
    return { code: 'unsupported', message: 'This browser does not support the audio features required for live microphone capture.', recoverable: false }
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return { code: 'mic-no-device', message: 'No microphone was found. Connect one, then try again.', recoverable: true }
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return { code: 'mic-busy', message: 'The microphone could not be opened. Close other apps using it and try again.', recoverable: true }
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return { code: 'mic-denied', message: 'Microphone access was blocked. Allow it in your browser’s site settings, then try again.', recoverable: true }
  }
  return { code: 'mic-denied', message: 'The microphone could not be started. Check browser permission and try again.', recoverable: true }
}

export function EchoFlowVoiceProvider({ children }: { children: ReactNode }) {
  const [phase, setPhaseState] = useState<VoicePhase>('idle')
  const [connection, setConnection] = useState<ConnectionState>('offline')
  const [micPermission, setMicPermission] = useState<MicPermission>('unknown')
  const [turns, setTurns] = useState<readonly TranscriptTurn[]>([])
  const [error, setError] = useState<VoiceError | null>(null)
  const [endReason, setEndReason] = useState<VoiceEndReason | null>(null)
  const [muted, setMutedState] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [endedAt, setEndedAt] = useState<number | null>(null)

  const phaseRef = useRef<VoicePhase>('idle')
  const levels = useRef<VoiceLevels>({ input: 0, output: 0 })
  const wsRef = useRef<WebSocket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const micAnalyserRef = useRef<AnalyserNode | null>(null)
  const captureNodeRef = useRef<AudioWorkletNode | null>(null)
  const captureMuteRef = useRef<GainNode | null>(null)
  const assistantAnalyserRef = useRef<AnalyserNode | null>(null)
  const assistantGainRef = useRef<GainNode | null>(null)
  const recognitionRef = useRef<any>(null)
  const recognitionRunningRef = useRef(false)
  const audioQueueRef = useRef<AudioBufferSourceNode[]>([])
  const animFrameRef = useRef<number | null>(null)
  const mutedRef = useRef(false)
  const masterVolumeRef = useRef(0.85)
  const currentAssistantTurnIdRef = useRef<string | null>(null)
  const assistantTurnIdsByRequestRef = useRef(new Map<string, string>())
  const serverTurnIdRef = useRef<string | null>(null)
  const cancelledTurnsRef = useRef(new Set<string>())
  const sessionActiveRef = useRef(false)
  const closeIntentionallyRef = useRef(true)

  const setPhase = useCallback((next: VoicePhase) => {
    phaseRef.current = next
    setPhaseState(next)
  }, [])

  const sendControl = useCallback((message: Record<string, unknown>) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify(message))
    return true
  }, [])

  const ensureAssistantTurn = useCallback((requestId: string, text: string, final = false) => {
    let id = assistantTurnIdsByRequestRef.current.get(requestId)
    if (!id) {
      id = `assistant-${requestId}`
      assistantTurnIdsByRequestRef.current.set(requestId, id)
    }
    const turnId = id
    setTurns((previous) => {
      const index = previous.findIndex((turn) => turn.id === turnId)
      if (index < 0) {
        return [...previous, { id: turnId, role: 'assistant', text, final, at: Date.now(), via: 'voice' }]
      }
      return previous.map((turn) => (turn.id === turnId ? { ...turn, text, final } : turn))
    })
    return turnId
  }, [])

  const flushAudioBuffer = useCallback(() => {
    const context = audioCtxRef.current
    const gain = assistantGainRef.current
    if (context && gain) {
      const now = context.currentTime
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(0, now + 0.012)
    }
    for (const source of audioQueueRef.current) {
      try {
        source.stop(context ? context.currentTime + 0.015 : 0)
      } catch {
        // A source that already ended is harmless.
      }
    }
    audioQueueRef.current = []
    serverTurnIdRef.current = null
  }, [])

  const releaseMedia = useCallback(() => {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    recognitionRunningRef.current = false
    if (recognition) {
      recognition.onend = null
      recognition.onerror = null
      try {
        recognition.stop()
      } catch {
        // It may not have started yet.
      }
    }
    if (captureNodeRef.current) {
      captureNodeRef.current.port.onmessage = null
      captureNodeRef.current.disconnect()
      captureNodeRef.current = null
    }
    captureMuteRef.current?.disconnect()
    captureMuteRef.current = null
    micSourceRef.current?.disconnect()
    micSourceRef.current = null
    micAnalyserRef.current?.disconnect()
    micAnalyserRef.current = null
    micStreamRef.current?.getTracks().forEach((track) => track.stop())
    micStreamRef.current = null
    flushAudioBuffer()
    assistantGainRef.current?.disconnect()
    assistantGainRef.current = null
    assistantAnalyserRef.current?.disconnect()
    assistantAnalyserRef.current = null
    const context = audioCtxRef.current
    audioCtxRef.current = null
    if (context && context.state !== 'closed') void context.close().catch(() => undefined)
    if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current)
    animFrameRef.current = null
    levels.current.input = 0
    levels.current.output = 0
  }, [flushAudioBuffer, levels])

  const stopSession = useCallback(() => {
    sessionActiveRef.current = false
    closeIntentionallyRef.current = true
    const ws = wsRef.current
    wsRef.current = null
    if (ws && ws.readyState < WebSocket.CLOSING) ws.close(1000, 'Session ended')
    releaseMedia()
    setConnection('offline')
  }, [releaseMedia])

  const startLevelMeter = useCallback(() => {
    if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current)
    const update = () => {
      const mic = micAnalyserRef.current
      if (mic && !mutedRef.current) {
        const data = new Uint8Array(mic.frequencyBinCount)
        mic.getByteFrequencyData(data)
        levels.current.input = Math.min(1, data.reduce((sum, value) => sum + value, 0) / data.length / 128)
      } else {
        levels.current.input = 0
      }
      const assistant = assistantAnalyserRef.current
      if (assistant) {
        const data = new Uint8Array(assistant.frequencyBinCount)
        assistant.getByteFrequencyData(data)
        levels.current.output = Math.min(1, (data.reduce((sum, value) => sum + value, 0) / data.length / 128) * masterVolumeRef.current)
      } else {
        levels.current.output = 0
      }
      animFrameRef.current = requestAnimationFrame(update)
    }
    update()
  }, [levels])

  const setAssistantGain = useCallback((value: number, fadeMs: number) => {
    const context = audioCtxRef.current
    const gain = assistantGainRef.current
    if (!context || !gain) return
    const now = context.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(value, now + Math.max(0, fadeMs) / 1000)
  }, [])

  const playAudio = useCallback(async (audioB64: string, turnId: string) => {
    const context = audioCtxRef.current
    const gain = assistantGainRef.current
    if (cancelledTurnsRef.current.has(turnId)) return
    if (!context || !gain) {
      // Text-only sessions still receive the answer text. Acknowledge the
      // optional audio so the server can finish the turn without a speaker.
      sendControl({ type: 'PLAYBACK_FINISHED', turn_id: turnId })
      return
    }
    try {
      const binary = atob(audioB64)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
      const buffer = await context.decodeAudioData(bytes.buffer)
      if (
        audioCtxRef.current !== context ||
        cancelledTurnsRef.current.has(turnId) ||
        serverTurnIdRef.current !== turnId
      ) return
      setAssistantGain(masterVolumeRef.current, 12)
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(gain)
      audioQueueRef.current.push(source)
      source.onended = () => {
        audioQueueRef.current = audioQueueRef.current.filter((item) => item !== source)
        source.disconnect()
        if (serverTurnIdRef.current === turnId && !cancelledTurnsRef.current.has(turnId)) {
          serverTurnIdRef.current = null
          sendControl({ type: 'PLAYBACK_FINISHED', turn_id: turnId })
        }
      }
      source.start(context.currentTime + 0.02)
      sendControl({ type: 'PLAYBACK_STARTED', turn_id: turnId })
    } catch {
      if (serverTurnIdRef.current === turnId && !cancelledTurnsRef.current.has(turnId)) {
        sendControl({ type: 'PLAYBACK_FAILED', turn_id: turnId })
      }
    }
  }, [sendControl, setAssistantGain])

  const startSpeechRecognition = useCallback((locale: string) => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRec || mutedRef.current || !sessionActiveRef.current) return
    const recognition = new SpeechRec()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = locale
    recognitionRef.current = recognition
    recognition.onstart = () => {
      recognitionRunningRef.current = true
    }
    recognition.onresult = (event: any) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (!result.isFinal) continue
        const text = String(result[0]?.transcript ?? '').trim()
        if (text) sendControl({ type: 'USER_TRANSCRIPT_FINAL', text })
      }
    }
    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.info('Browser speech recognition:', event.error)
      }
    }
    recognition.onend = () => {
      recognitionRunningRef.current = false
      if (recognitionRef.current === recognition && sessionActiveRef.current && !mutedRef.current) {
        window.setTimeout(() => {
          if (recognitionRef.current !== recognition || !sessionActiveRef.current || mutedRef.current) return
          try {
            recognition.start()
          } catch {
            // Some browsers restart recognition themselves; a later onend retries.
          }
        }, 250)
      }
    }
    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      console.info('Browser speech recognition could not start; typed messages remain available.')
    }
  }, [sendControl])

  const failSession = useCallback((nextError: VoiceError) => {
    stopSession()
    setError(nextError)
    setEndedAt(Date.now())
    setPhase('error')
  }, [setPhase, stopSession])

  const connectWebSocket = useCallback((config: VoiceSessionConfig) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/audio`)
    wsRef.current = ws
    closeIntentionallyRef.current = false
    setConnection('connecting')

    return new Promise<void>((resolve, reject) => {
      let settled = false
      const timeout = window.setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error('The voice service did not respond in time.'))
        ws.close()
      }, 10_000)
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        if (error) reject(error)
        else resolve()
      }

      ws.onopen = () => setConnection('online')
      ws.onerror = () => {
        setConnection('offline')
        finish(new Error('Could not connect to the voice service.'))
      }
      ws.onclose = () => {
        setConnection('offline')
        if (!settled) finish(new Error('The voice service closed the connection before the session started.'))
        else if (!closeIntentionallyRef.current && sessionActiveRef.current) {
          failSession({ code: 'connection-lost', message: 'The connection was lost. Try starting a new conversation.', recoverable: true })
        }
      }
      ws.onmessage = (event) => {
        let msg: Record<string, any>
        try {
          msg = JSON.parse(event.data) as Record<string, any>
        } catch {
          return
        }
        if (wsRef.current !== ws) return

        switch (msg.type) {
          case 'SESSION_INIT':
            setConnection('online')
            setPhase('listening')
            setStartedAt(Date.now())
            sendControl({ type: 'SET_VOICE', locale: config.locale, voice_id: config.voiceId })
            finish()
            break
          case 'USER_MESSAGE': {
            const userTurn: TranscriptTurn = {
              id: `user-${msg.request_id ?? Date.now()}`,
              role: 'user',
              text: String(msg.text ?? ''),
              final: true,
              at: Date.now(),
              via: 'voice',
            }
            setTurns((previous) => [...previous, userTurn])
            setPhase('thinking')
            break
          }
          case 'LLM_GENERATION_START':
            ensureAssistantTurn(String(msg.request_id), '', false)
            setPhase('thinking')
            break
          case 'LLM_TOKEN_DELTA': {
            const requestId = String(msg.request_id ?? '')
            const id = assistantTurnIdsByRequestRef.current.get(requestId)
            if (id) setTurns((previous) => previous.map((turn) => turn.id === id ? { ...turn, text: turn.text + String(msg.token ?? '') } : turn))
            break
          }
          case 'ASSISTANT_TEXT_READY':
            ensureAssistantTurn(String(msg.request_id), String(msg.text ?? ''), false)
            break
          case 'LLM_GENERATION_CANCELLED': {
            const requestId = String(msg.request_id ?? '')
            const id = assistantTurnIdsByRequestRef.current.get(requestId)
            if (id) setTurns((previous) => previous.map((turn) => turn.id === id ? { ...turn, final: true, interrupted: true } : turn))
            break
          }
          case 'ASSISTANT_SPEAKING_START': {
            const requestId = String(msg.request_id ?? '')
            const id = ensureAssistantTurn(requestId, String(msg.text ?? ''), false)
            currentAssistantTurnIdRef.current = id
            serverTurnIdRef.current = String(msg.turn_id ?? '')
            setPhase('speaking')
            break
          }
          case 'ASSISTANT_AUDIO':
            if (msg.audio_b64 && msg.turn_id) void playAudio(String(msg.audio_b64), String(msg.turn_id))
            break
          case 'ASSISTANT_SPEAKING_END': {
            const id = currentAssistantTurnIdRef.current
            if (id) setTurns((previous) => previous.map((turn) => turn.id === id ? { ...turn, final: true } : turn))
            currentAssistantTurnIdRef.current = null
            serverTurnIdRef.current = null
            setAssistantGain(masterVolumeRef.current, 50)
            setPhase('listening')
            break
          }
          case 'ASSISTANT_STOPPED': {
            const cancelledServerTurn = String(msg.turn_id ?? '')
            if (cancelledServerTurn) cancelledTurnsRef.current.add(cancelledServerTurn)
            flushAudioBuffer()
            const id = currentAssistantTurnIdRef.current
            if (id) {
              const playedText = String(msg.rollback?.truncated_text ?? '')
              setTurns((previous) => previous.map((turn) => turn.id === id ? { ...turn, text: playedText, final: true, interrupted: true } : turn))
            }
            currentAssistantTurnIdRef.current = null
            setPhase('listening')
            break
          }
          case 'PLAYBACK_TIMEOUT': {
            flushAudioBuffer()
            const id = currentAssistantTurnIdRef.current
            if (id) {
              const playedText = String(msg.rollback?.truncated_text ?? '')
              setTurns((previous) => previous.map((turn) => turn.id === id ? { ...turn, text: playedText, final: true, interrupted: true } : turn))
            }
            currentAssistantTurnIdRef.current = null
            setPhase('listening')
            break
          }
          case 'ACOUSTIC_DUCK_TRIGGER':
            setAssistantGain(masterVolumeRef.current * (Number(msg.duck_ratio) || 0.15), Number(msg.fade_ms) || 30)
            break
          case 'ACOUSTIC_DUCK_RELEASE':
          case 'BACKCHANNEL_IGNORED':
          case 'NOISE_REJECTED':
            setAssistantGain(masterVolumeRef.current, Number(msg.fade_ms) || 50)
            break
          case 'VAD_STATE':
            if (msg.active && phaseRef.current !== 'speaking' && phaseRef.current !== 'thinking') setPhase('user-speaking')
            else if (!msg.active && phaseRef.current === 'user-speaking') setPhase('listening')
            break
          case 'HARD_BARGE_IN_TRIGGERED': {
            const interruptedServerTurn = String(msg.turn_id ?? '')
            if (interruptedServerTurn) cancelledTurnsRef.current.add(interruptedServerTurn)
            flushAudioBuffer()
            const id = currentAssistantTurnIdRef.current
            if (id) {
              const playedText = String(msg.rollback?.truncated_text ?? '')
              setTurns((previous) => previous.map((turn) => turn.id === id ? { ...turn, text: playedText, final: true, interrupted: true } : turn))
            }
            currentAssistantTurnIdRef.current = null
            setPhase('user-speaking')
            break
          }
          case 'AUDIO_UNAVAILABLE':
            break
          case 'ERROR': {
            const requestId = String(msg.request_id ?? '')
            const id = assistantTurnIdsByRequestRef.current.get(requestId)
            if (id) {
              const message = String(msg.message ?? 'The reply could not be generated.')
              setTurns((previous) => previous.map((turn) => turn.id === id ? { ...turn, text: message, final: true } : turn))
              setPhase('listening')
            } else {
              failSession({ code: 'transport-error', message: String(msg.message ?? 'The voice session encountered an error.'), recoverable: true })
            }
            break
          }
          default:
            break
        }
      }
    })
  }, [ensureAssistantTurn, failSession, flushAudioBuffer, playAudio, sendControl, setAssistantGain, setPhase])

  const start = useCallback(async (config: VoiceSessionConfig, initialText?: string) => {
    const textOnly = initialText !== undefined
    if (sessionActiveRef.current) return
    sessionActiveRef.current = true
    setError(null)
    setEndReason(null)
    setEndedAt(null)
    setStartedAt(null)
    setMutedState(false)
    mutedRef.current = false
    cancelledTurnsRef.current.clear()
    assistantTurnIdsByRequestRef.current.clear()
    currentAssistantTurnIdRef.current = null
    serverTurnIdRef.current = null
    setMicPermission('unknown')
    setPhase(textOnly ? 'connecting' : 'requesting-mic')

    try {
      let stream: MediaStream | null = null
      if (!textOnly) {
        if (!navigator.mediaDevices?.getUserMedia) {
          if (!window.isSecureContext) {
            failSession({ code: 'insecure-context', message: 'Microphone access requires localhost or HTTPS.', recoverable: false })
          } else {
            failSession({ code: 'unsupported', message: 'Microphone capture is not available in this browser.', recoverable: false })
          }
          return
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        })
        if (!sessionActiveRef.current) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        micStreamRef.current = stream
        setMicPermission('granted')
      }

      let context: AudioContext | null = null
      try {
        context = new AudioContext()
        audioCtxRef.current = context
        if (context.state === 'suspended') await context.resume()
      } catch (cause) {
        if (!textOnly) throw cause
        console.info('Audio playback is unavailable; continuing with text replies.')
      }

      if (!textOnly) {
        if (!context || !stream) throw new Error('AudioContext is not available in this browser.')
        if (!context.audioWorklet) throw new Error('AudioWorklet is not supported in this browser.')
        await context.audioWorklet.addModule('/audio-worklet.js')
        if (!sessionActiveRef.current) {
          releaseMedia()
          return
        }

        const micSource = context.createMediaStreamSource(stream)
        const micAnalyser = context.createAnalyser()
        micAnalyser.fftSize = 256
        micSource.connect(micAnalyser)
        micSourceRef.current = micSource
        micAnalyserRef.current = micAnalyser

        const captureNode = new AudioWorkletNode(context, 'echoflow-pcm-capture', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          channelCount: 1,
        })
        const captureMute = context.createGain()
        captureMute.gain.value = 0
        captureNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
          const ws = wsRef.current
          if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 64 * 1024) ws.send(event.data)
        }
        micAnalyser.connect(captureNode)
        captureNode.connect(captureMute)
        captureMute.connect(context.destination)
        captureNodeRef.current = captureNode
        captureMuteRef.current = captureMute
      }

      if (context) {
        const assistantGain = context.createGain()
        assistantGain.gain.value = masterVolumeRef.current
        const assistantAnalyser = context.createAnalyser()
        assistantAnalyser.fftSize = 256
        assistantGain.connect(assistantAnalyser)
        assistantAnalyser.connect(context.destination)
        assistantGainRef.current = assistantGain
        assistantAnalyserRef.current = assistantAnalyser
      }

      startLevelMeter()
      setPhase('connecting')
      await connectWebSocket(config)
      if (!sessionActiveRef.current) return
      if (textOnly) {
        const cleanText = initialText.trim()
        if (cleanText && sendControl({ type: 'USER_TEXT_INPUT', text: cleanText })) setPhase('thinking')
      } else {
        startSpeechRecognition(config.locale)
      }
    } catch (cause) {
      if (!sessionActiveRef.current) return
      const message = cause instanceof Error ? cause.message : 'The voice session could not be started.'
      if (textOnly) {
        failSession({ code: 'connection-failed', message, recoverable: true })
        return
      }
      const microphoneWasGranted = Boolean(micStreamRef.current)
      const audioFeatureUnavailable = message.includes('AudioWorklet') || message.includes('AudioContext')
      const mapped = microphoneWasGranted && !audioFeatureUnavailable
        ? { code: 'connection-failed' as const, message, recoverable: true }
        : getMicError(cause)
      failSession(mapped)
    }
  }, [connectWebSocket, failSession, releaseMedia, sendControl, setPhase, startLevelMeter, startSpeechRecognition])

  const end = useCallback(() => {
    stopSession()
    setPhase('ended')
    setEndedAt(Date.now())
    setEndReason('user')
  }, [sendControl, setPhase, stopSession])

  const setMuted = useCallback((nextMuted: boolean) => {
    mutedRef.current = nextMuted
    setMutedState(nextMuted)
    micStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted })
    const recognition = recognitionRef.current
    if (nextMuted && recognition) {
      try {
        recognition.stop()
      } catch {
        // Recognition can already be stopping.
      }
    } else if (!nextMuted && recognition && !recognitionRunningRef.current) {
      try {
        recognition.start()
      } catch {
        // The browser may still be completing a previous stop.
      }
    }
  }, [])

  const interrupt = useCallback(() => {
    if (!sessionActiveRef.current || (phase !== 'speaking' && phase !== 'thinking')) return
    flushAudioBuffer()
    sendControl({ type: 'STOP_ASSISTANT' })
  }, [flushAudioBuffer, phase, sendControl])

  const sendText = useCallback((text: string, config?: VoiceSessionConfig) => {
    const cleanText = text.trim()
    if (!cleanText || cleanText.length > MAX_MESSAGE_CHARS) return
    if (!sessionActiveRef.current) {
      if (config) void start(config, cleanText)
      return
    }
    if (!sendControl({ type: 'USER_TEXT_INPUT', text: cleanText })) return
    setPhase('thinking')
  }, [sendControl, setPhase, start])

  const setOutputVolume = useCallback((volume: number) => {
    const normalized = Math.min(1, Math.max(0, volume))
    masterVolumeRef.current = normalized
    setAssistantGain(normalized, 20)
  }, [setAssistantGain])

  const reset = useCallback(() => {
    end()
    setTurns([])
    setError(null)
    setStartedAt(null)
    setEndedAt(null)
    setEndReason(null)
    setPhase('idle')
  }, [end, setPhase])

  useEffect(() => () => {
    sessionActiveRef.current = false
    closeIntentionallyRef.current = true
    const ws = wsRef.current
    wsRef.current = null
    if (ws && ws.readyState < WebSocket.CLOSING) ws.close(1000, 'Page closed')
    releaseMedia()
  }, [releaseMedia])

  const session: VoiceSession = {
    phase,
    connection,
    micPermission,
    turns,
    error,
    endReason,
    muted,
    startedAt,
    endedAt,
    isPreview: false,
    textInput: true,
    levels,
    actions: { start, end, setMuted, interrupt, sendText, setOutputVolume, reset },
  }

  return <VoiceSessionContext.Provider value={session}>{children}</VoiceSessionContext.Provider>
}
