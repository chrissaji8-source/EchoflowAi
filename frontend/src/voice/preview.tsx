/**
 * Preview-only mock provider for interface development.
 *
 * This is NOT an AI and NOT an integration. It plays a short scripted
 * conversation, with simulated loudness and word-by-word captions, so the
 * assistant page can be reviewed end to end. It never touches the microphone,
 * the network or any audio API.
 *
 * This provider is not used by the app. The live provider is `echoflow.tsx`.
 * Do not use this mock as a production voice service.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { VoiceSessionContext, type VoiceLevels, type VoiceSession } from './session'
import type {
  ConnectionState,
  MicPermission,
  TranscriptTurn,
  VoiceEndReason,
  VoiceError,
  VoiceErrorCode,
  VoicePhase,
  VoiceSessionConfig,
} from './types'

type Line = { role: 'assistant' | 'user'; text: string }

const SCRIPT: Line[] = [
  { role: 'assistant', text: 'Hi, I’m EchoFlow. What would you like help with today?' },
  { role: 'user', text: 'Can you help me plan a simple dinner for tonight?' },
  {
    role: 'assistant',
    text: 'Sure. How about a quick vegetable stir-fry with rice? Tell me what ingredients you have, and I can tailor the idea.',
  },
  { role: 'user', text: 'I have carrots, eggs, and leftover rice.' },
  {
    role: 'assistant',
    text: 'That works well. Scramble the eggs, set them aside, then stir-fry the carrots and rice. Add the eggs back in and season with soy sauce or salt if you have it.',
  },
  { role: 'user', text: 'That sounds easy. Thanks!' },
  { role: 'assistant', text: 'You’re welcome. I can also suggest a quick side dish if you’d like.' },
]

const TYPED_REPLY =
  'This is a preview mock. The live assistant is available through the EchoFlow provider.'

const SAMPLE_TURNS: Pick<TranscriptTurn, 'role' | 'text'>[] = [
  { role: 'assistant', text: 'Hi, I’m EchoFlow. What would you like help with today?' },
  { role: 'user', text: 'Can you help me plan a simple dinner for tonight?' },
  { role: 'assistant', text: 'Sure. What ingredients do you have?' },
]

const ERRORS: Record<VoiceErrorCode, { message: string; recoverable: boolean }> = {
  'mic-denied': {
    message: 'Microphone access is blocked for this site. You can allow it in your browser’s site settings, then try again.',
    recoverable: true,
  },
  'mic-no-device': { message: 'No microphone was found on this device. Connect one, then try again.', recoverable: true },
  'mic-busy': { message: 'Your microphone couldn’t be opened. Another app may be using it.', recoverable: true },
  'mic-lost': { message: 'The microphone stopped working during the conversation.', recoverable: true },
  'insecure-context': { message: 'Browsers only allow microphone access on secure (https) pages.', recoverable: false },
  unsupported: { message: 'This browser can’t capture audio. Try a recent version of Chrome, Edge, Safari or Firefox.', recoverable: false },
  'connection-failed': { message: 'We couldn’t reach the assistant. Check your connection and try again.', recoverable: true },
  'connection-lost': { message: 'The connection dropped and couldn’t be recovered.', recoverable: true },
  'transport-error': { message: 'Something went wrong on our side. Nothing you said was acted on.', recoverable: true },
}

const PERMISSION_FOR_ERROR: Partial<Record<VoiceErrorCode, MicPermission>> = {
  'mic-denied': 'denied',
  'mic-no-device': 'no-device',
  'mic-busy': 'busy',
  'insecure-context': 'insecure-context',
  unsupported: 'unsupported',
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

export function PreviewVoiceProvider({ children }: { children: ReactNode }) {
  const [phase, setPhaseState] = useState<VoicePhase>('idle')
  const [connection, setConnection] = useState<ConnectionState>('offline')
  const [micPermission, setMicPermission] = useState<MicPermission>('unknown')
  const [turns, setTurns] = useState<readonly TranscriptTurn[]>([])
  const [error, setError] = useState<VoiceError | null>(null)
  const [endReason, setEndReason] = useState<VoiceEndReason | null>(null)
  const [muted, setMutedState] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [endedAt, setEndedAt] = useState<number | null>(null)

  const levels = useRef<VoiceLevels>({ input: 0, output: 0 })
  const phaseRef = useRef<VoicePhase>('idle')
  const mutedRef = useRef(false)
  const volumeRef = useRef(1)
  const burstRef = useRef(0)
  const runRef = useRef(0)
  const idRef = useRef(0)
  const interruptRef = useRef(false)

  const setPhase = useCallback((p: VoicePhase) => {
    phaseRef.current = p
    setPhaseState(p)
  }, [])

  const nextId = () => `t${++idRef.current}`
  const push = (turn: TranscriptTurn) => setTurns((t) => [...t, turn])
  const patch = (id: string, change: Partial<TranscriptTurn>) =>
    setTurns((t) => t.map((x) => (x.id === id ? { ...x, ...change } : x)))

  // Simulated loudness: a burst on every word, decaying between words.
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = performance.now() / 1000
      const burst = burstRef.current
      burstRef.current = burst * 0.86
      const p = phaseRef.current
      const wobble = 0.55 + 0.45 * Math.abs(Math.sin(t * 9.3) * Math.cos(t * 4.1))
      const speaking = p === 'speaking' ? (0.22 + 0.78 * burst) * wobble * volumeRef.current : 0
      const talking = p === 'user-speaking' && !mutedRef.current ? (0.2 + 0.8 * burst) * wobble : 0
      const room = (p === 'listening' || p === 'thinking') && !mutedRef.current ? 0.03 + 0.02 * Math.sin(t * 2.1) : 0
      const lv = levels.current
      lv.output += (speaking - lv.output) * 0.4
      lv.input += (Math.max(talking, room) - lv.input) * 0.4
    }, 33)
    return () => window.clearInterval(id)
  }, [])

  // Invalidate any running script when the provider goes away.
  useEffect(
    () => () => {
      runRef.current++
    },
    [],
  )

  const alive = (token: number) => runRef.current === token

  const speak = useCallback(
    async (text: string, token: number, lead: number) => {
      setPhase('thinking')
      await sleep(lead)
      if (!alive(token)) return
      const id = nextId()
      push({ id, role: 'assistant', text: '', final: false, at: Date.now(), via: 'voice' })
      interruptRef.current = false
      setPhase('speaking')
      const words = text.split(' ')
      let shown = ''
      for (const word of words) {
        if (!alive(token)) return
        if (interruptRef.current) {
          interruptRef.current = false
          patch(id, { final: true, interrupted: true })
          setPhase('listening')
          return
        }
        shown = shown ? `${shown} ${word}` : word
        burstRef.current = 1
        patch(id, { text: shown })
        await sleep(150 + word.length * 34)
      }
      if (!alive(token)) return
      patch(id, { final: true })
      setPhase('listening')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setPhase],
  )

  const userSays = useCallback(
    async (text: string, token: number) => {
      await sleep(900)
      while (mutedRef.current) {
        await sleep(200)
        if (!alive(token)) return
      }
      if (!alive(token)) return
      const id = nextId()
      const t0 = Date.now()
      push({ id, role: 'user', text: '', final: false, at: t0, via: 'voice' })
      setPhase('user-speaking')
      let shown = ''
      for (const word of text.split(' ')) {
        if (!alive(token)) return
        shown = shown ? `${shown} ${word}` : word
        burstRef.current = 1
        patch(id, { text: shown })
        await sleep(120 + word.length * 30)
      }
      patch(id, { final: true, speechMs: Date.now() - t0 })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setPhase],
  )

  const finish = useCallback(
    (reason: VoiceEndReason) => {
      runRef.current++
      setTurns((t) => t.map((x) => (x.final ? x : { ...x, final: true, interrupted: x.role === 'assistant' ? true : x.interrupted })))
      setPhase('ended')
      setConnection('offline')
      setEndReason(reason)
      setEndedAt(Date.now())
    },
    [setPhase],
  )

  const start = useCallback(
    (_config: VoiceSessionConfig) => {
      if (!['idle', 'ended', 'error'].includes(phaseRef.current)) return
      const token = ++runRef.current
      setTurns([])
      setError(null)
      setEndReason(null)
      setStartedAt(null)
      setEndedAt(null)
      setMicPermission('granted')
      setConnection('connecting')
      setPhase('connecting')

      void (async () => {
        await sleep(1100)
        if (!alive(token)) return
        setConnection('online')
        setStartedAt(Date.now())
        setPhase('listening')
        for (let i = 0; i < SCRIPT.length; i++) {
          if (!alive(token)) return
          const line = SCRIPT[i]
          if (line.role === 'assistant') await speak(line.text, token, i === 0 ? 500 : 1000)
          else await userSays(line.text, token)
        }
        if (!alive(token)) return
        await sleep(2600)
        if (alive(token)) finish('remote')
      })()
    },
    [finish, setPhase, speak, userSays],
  )

  const end = useCallback(() => finish('user'), [finish])

  const interrupt = useCallback(() => {
    if (phaseRef.current === 'speaking') interruptRef.current = true
  }, [])

  const setMuted = useCallback((m: boolean) => {
    mutedRef.current = m
    setMutedState(m)
  }, [])

  const sendText = useCallback(
    (text: string, config?: VoiceSessionConfig) => {
      const clean = text.trim()
      if (!clean) return
      if (!['listening', 'user-speaking', 'thinking', 'speaking'].includes(phaseRef.current)) {
        if (!config || !['idle', 'ended', 'error'].includes(phaseRef.current)) return
        const token = ++runRef.current
        setTurns([{ id: nextId(), role: 'user', text: clean, final: true, at: Date.now(), via: 'text' }])
        setError(null)
        setEndReason(null)
        setStartedAt(Date.now())
        setEndedAt(null)
        setMicPermission('unknown')
        setConnection('online')
        setPhase('thinking')
        void speak(TYPED_REPLY, token, 900)
        return
      }
      const token = ++runRef.current
      interruptRef.current = false
      setTurns((t) => t.map((x) => (x.final ? x : { ...x, final: true, interrupted: x.role === 'assistant' ? true : x.interrupted })))
      push({ id: nextId(), role: 'user', text: clean, final: true, at: Date.now(), via: 'text' })
      void (async () => {
        await speak(TYPED_REPLY, token, 900)
      })()
    },
    [setPhase, speak],
  )

  const setOutputVolume = useCallback((v: number) => {
    volumeRef.current = Math.min(1, Math.max(0, v))
  }, [])

  const reset = useCallback(() => {
    runRef.current++
    setTurns([])
    setError(null)
    setEndReason(null)
    setStartedAt(null)
    setEndedAt(null)
    setConnection('offline')
    setPhase('idle')
  }, [setPhase])

  // --- design-review helpers: jump straight to any state ---------------------

  const forcePhase = useCallback(
    (p: VoicePhase) => {
      runRef.current++
      interruptRef.current = false
      setError(null)
      setTurns((t) => t.filter((x) => x.final))
      const live: VoicePhase[] = ['listening', 'user-speaking', 'thinking', 'speaking', 'reconnecting']
      if (live.includes(p)) {
        setStartedAt((s) => s ?? Date.now() - 74_000)
        setEndedAt(null)
        setEndReason(null)
        setConnection(p === 'reconnecting' ? 'reconnecting' : 'online')
        setTurns((t) => {
          if (t.length) return t
          const now = Date.now()
          return SAMPLE_TURNS.map((s, i) => ({
            id: nextId(),
            role: s.role,
            text: s.text,
            final: true,
            at: now - (SAMPLE_TURNS.length - i) * 12_000,
            via: 'voice' as const,
          }))
        })
        if (p === 'speaking') {
          const id = nextId()
          setTurns((t) => [
            ...t,
            { id, role: 'assistant', final: false, at: Date.now(), via: 'voice', text: 'Scramble the eggs, then stir-fry the carrots and rice. Add the eggs back in and season to taste.' },
          ])
        }
        if (p === 'user-speaking') {
          setTurns((t) => [...t, { id: nextId(), role: 'user', final: false, at: Date.now(), via: 'voice', text: 'I have carrots, eggs, and leftover' }])
        }
      } else if (p === 'ended') {
        setTurns((t) => (t.length ? t : SAMPLE_TURNS.map((s) => ({ id: nextId(), role: s.role, text: s.text, final: true, at: Date.now() - 60_000, via: 'voice' as const }))))
        setStartedAt((s) => s ?? Date.now() - 134_000)
        setEndedAt(Date.now())
        setEndReason('user')
        setConnection('offline')
      } else if (p === 'idle') {
        setTurns([])
        setStartedAt(null)
        setEndedAt(null)
        setEndReason(null)
        setConnection('offline')
      } else {
        setConnection(p === 'connecting' ? 'connecting' : 'offline')
      }
      setPhase(p)
      burstRef.current = 1
    },
    [setPhase],
  )

  const forceError = useCallback(
    (code: VoiceErrorCode) => {
      runRef.current++
      const def = ERRORS[code]
      setError({ code, message: def.message, recoverable: def.recoverable })
      setMicPermission(PERMISSION_FOR_ERROR[code] ?? 'unknown')
      setConnection('offline')
      setPhase('error')
    },
    [setPhase],
  )

  const session = useMemo<VoiceSession>(
    () => ({
      phase,
      connection,
      micPermission,
      turns,
      error,
      endReason,
      muted,
      startedAt,
      endedAt,
      isPreview: true,
      textInput: true,
      levels,
      actions: { start, end, setMuted, interrupt, sendText, setOutputVolume, reset },
      debug: { forcePhase, forceError },
    }),
    [phase, connection, micPermission, turns, error, endReason, muted, startedAt, endedAt, start, end, setMuted, interrupt, sendText, setOutputVolume, reset, forcePhase, forceError],
  )

  return <VoiceSessionContext.Provider value={session}>{children}</VoiceSessionContext.Provider>
}
