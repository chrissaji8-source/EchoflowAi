import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Mark } from '../components/Mark'
import { TLink } from '../components/Nav'
import { LOCALES, VOICES, type CaptionSize } from '../voice/options'
import {
  Announcer,
  Dock,
  EndedPanel,
  ErrorPanel,
  IdlePanel,
  LiveCaptions,
  PHASE_COPY,
  SettingsDialog,
  TranscriptPanel,
  TypeBox,
  formatClock,
  isLive,
} from '../voice/parts'
import { useVoiceSession } from '../voice/session'
import { TrackCanvas } from '../voice/TrackCanvas'

const CONNECTION_LABEL = {
  online: 'Connected to EchoFlow',
  connecting: 'Connecting...',
  reconnecting: 'Reconnecting...',
  offline: 'Disconnected',
} as const

export default function Assistant() {
  const session = useVoiceSession()
  const { phase, connection, muted, micPermission, startedAt, endedAt, actions, levels, textInput } = session

  // UI preferences
  const [captionsOn, setCaptionsOn] = useState(true)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const [captionSize, setCaptionSize] = useState<CaptionSize>('md')
  const [locale, setLocale] = useState<string>(LOCALES[0].id)
  const [voiceId, setVoiceId] = useState<string>(VOICES[0].id)
  const [volume, setVolume] = useState(0.85)

  const live = isLive(phase)

  // Clock
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt || endedAt) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [startedAt, endedAt])
  const elapsed = startedAt ? (endedAt ?? now) - startedAt : 0

  const start = useCallback(() => actions.start({ locale, voiceId, bargeIn: true }), [actions, locale, voiceId])
  const sendText = useCallback(
    (text: string) => actions.sendText(text, { locale, voiceId, bargeIn: true }),
    [actions, locale, voiceId],
  )

  const onVolume = (v: number) => {
    setVolume(v)
    actions.setOutputVolume(v)
  }

  useEffect(() => {
    actions.setOutputVolume(volume)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (document.querySelector('[role="dialog"]')) return
      const k = e.key.toLowerCase()
      if (k === 'm' && live) actions.setMuted(!muted)
      else if (k === 'c') setCaptionsOn((v) => !v)
      else if (k === 't') setTranscriptOpen((v) => !v)
      else if (k === 's' && phase === 'speaking') actions.interrupt()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions, live, muted, phase])

  useLayoutEffect(() => {
    document.documentElement.classList.add('is-call')
    return () => document.documentElement.classList.remove('is-call')
  }, [])

  const settled = phase === 'idle' || phase === 'ended' || phase === 'error'
  const stateLabel = muted && phase === 'listening' ? 'Muted' : PHASE_COPY[phase].label

  const micLabel =
    phase === 'ended'
      ? 'Turn Completed'
      : phase === 'error' || phase === 'idle' || phase === 'requesting-mic'
        ? 'Microphone Off'
        : micPermission !== 'granted'
          ? 'Text mode · microphone off'
          : muted
            ? 'Microphone Muted'
            : 'Microphone active'

  const showClock = !!startedAt && (live || phase === 'ended')

  return (
    <div className={`va va--${phase}`} data-tone="ink" data-speaker={phase === 'speaking' ? 'ai' : phase === 'user-speaking' ? 'you' : 'none'}>
      <Announcer session={session} />

      <header className="va-bar">
        <TLink to="/" className="va-back">
          <ArrowLeft size={17} aria-hidden="true" />
          <span>Overview</span>
        </TLink>

        <div className="va-brand">
          <Mark size={20} />
          <span>echoflow</span>
          <em style={{ fontFamily: 'monospace', fontSize: '11px', background: 'rgba(0,240,255,0.15)', color: '#00f0ff', padding: '2px 8px', borderRadius: '4px' }}>
            OmniIntercept
          </em>
        </div>

        <div className="va-bar-right">
          {phase !== 'idle' && phase !== 'error' && <span className="va-conn">{CONNECTION_LABEL[connection]}</span>}
          <SettingsDialog
            locale={locale}
            onLocale={setLocale}
            voiceId={voiceId}
            onVoice={setVoiceId}
            captionSize={captionSize}
            onCaptionSize={setCaptionSize}
            live={live}
          />
        </div>
      </header>

      <div className="va-telemetry" aria-label="How the demo handles voice">
        <span><strong>Audio input:</strong> 16 kHz mono</span>
        <span><strong>Interrupts:</strong> finalized browser transcripts</span>
        <span><strong>Context recovery:</strong> estimated from playback time</span>
      </div>

      <div className={`va-body${transcriptOpen ? ' has-transcript' : ''}`}>
        <main className="va-stage" id="main">
          <p className="slate va-slate">
            <span>{micLabel}</span>
            {showClock && (
              <span className="slate-index" aria-label="Call length">
                TC {formatClock(elapsed)}
              </span>
            )}
          </p>

          {!settled && (
            <p className="va-state" aria-hidden="true">
              {stateLabel}
              <span>.</span>
            </p>
          )}
          {!settled && <h1 className="sr-only">EchoFlow Voice Assistant</h1>}

          <div className="va-tracks">
            <TrackCanvas phase={phase} muted={muted} levels={levels} />
            <span className="va-lane va-lane--you" aria-hidden="true">
              You
            </span>
            <span className="va-lane va-lane--ai" aria-hidden="true">
              EchoFlow
            </span>
          </div>

          <div className="va-under">
            {phase === 'idle' && <IdlePanel onStart={start} onTextSend={sendText} />}
            {phase === 'ended' && <EndedPanel session={session} onAgain={() => { actions.reset(); start() }} />}
            {phase === 'error' && <ErrorPanel session={session} onRetry={() => { actions.reset(); start() }} onTextSend={sendText} />}
            {!settled && <LiveCaptions session={session} size={captionSize} show={captionsOn} />}
          </div>
        </main>

        <TranscriptPanel session={session} open={transcriptOpen} onClose={() => setTranscriptOpen(false)} />
      </div>

      {live && (
        <div className="va-foot">
          <Dock
            session={session}
            volume={volume}
            captionsOn={captionsOn}
            transcriptOpen={transcriptOpen}
            typeOpen={typeOpen}
            onVolume={onVolume}
            onCaptions={() => setCaptionsOn((v) => !v)}
            onTranscript={() => setTranscriptOpen((v) => !v)}
            onType={() => setTypeOpen((v) => !v)}
          />
          {typeOpen && textInput && <TypeBox onSend={sendText} />}
        </div>
      )}
    </div>
  )
}
