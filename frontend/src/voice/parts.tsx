import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Captions as CaptionsIcon,
  Download,
  Keyboard,
  LifeBuoy,
  MicOff,
  Mic,
  PhoneOff,
  RotateCcw,
  Send,
  ScrollText,
  Settings2,
  ShieldAlert,
  Square,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { TLink } from '../components/Nav'
import { CAPTION_SIZES, LOCALES, VOICES, type CaptionSize } from './options'
import type { VoiceSession } from './session'
import type { TranscriptTurn, VoiceErrorCode, VoicePhase } from './types'

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export const PHASE_COPY: Record<VoicePhase, { label: string; hint: string }> = {
  idle: { label: 'Ready', hint: 'Press start when you’re ready to talk.' },
  'requesting-mic': { label: 'Microphone', hint: 'Allow microphone access when your browser asks.' },
  connecting: { label: 'Connecting', hint: 'One moment…' },
  listening: { label: 'Listening', hint: 'Speak whenever you’re ready.' },
  'user-speaking': { label: 'Hearing you', hint: 'Go on, I’m listening.' },
  thinking: { label: 'Thinking', hint: 'Just a moment.' },
  speaking: { label: 'EchoFlow', hint: 'Speak at any time to interrupt.' },
  reconnecting: { label: 'Reconnecting', hint: 'We lost the line for a moment. Hold on.' },
  ended: { label: 'Call ended', hint: '' },
  error: { label: 'Couldn’t start', hint: '' },
}

const ERROR_TITLE: Record<VoiceErrorCode, string> = {
  'mic-denied': 'Microphone is blocked',
  'mic-no-device': 'No microphone found',
  'mic-busy': 'Microphone is busy',
  'mic-lost': 'Microphone disconnected',
  'insecure-context': 'This page needs to be secure',
  unsupported: 'Browser not supported',
  'connection-failed': 'Couldn’t connect',
  'connection-lost': 'Connection lost',
  'transport-error': 'Something went wrong',
}

export const isLive = (p: VoicePhase) =>
  p === 'listening' || p === 'user-speaking' || p === 'thinking' || p === 'speaking' || p === 'reconnecting'

export const formatClock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Screen-reader announcements. Only finished turns and major state changes are
// spoken, never the word-by-word captions.
// ---------------------------------------------------------------------------

export function Announcer({ session }: { session: VoiceSession }) {
  const { phase, turns, error } = session
  const lastFinal = useMemo(() => [...turns].reverse().find((t) => t.final && t.text), [turns])
  let message = ''
  if (phase === 'error') message = error?.message ?? 'Something went wrong.'
  else if (phase === 'ended') message = 'The conversation has ended.'
  else if (phase === 'connecting') message = 'Connecting.'
  else if (phase === 'reconnecting') message = 'Reconnecting.'
  else if (lastFinal) message = `${lastFinal.role === 'user' ? 'You' : 'EchoFlow'}: ${lastFinal.text}`
  return (
    <div className="sr-only" role="status" aria-live="polite">
      {message}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Captions
// ---------------------------------------------------------------------------

export function LiveCaptions({
  session,
  size,
  show,
}: {
  session: VoiceSession
  size: CaptionSize
  show: boolean
}) {
  const { phase, turns, muted } = session
  const last = turns[turns.length - 1]
  const live = phase === 'speaking' || phase === 'user-speaking'

  let hint = PHASE_COPY[phase].hint
  if (muted && (phase === 'listening' || phase === 'user-speaking')) hint = 'You’re muted. Unmute to reply, or type a message.'

  const showTurn = show && last && phase !== 'connecting' && phase !== 'requesting-mic'
  const text = last ? last.text || (last.via === 'voice' ? 'Voice message' : '') : ''

  return (
    <div className={`caps caps--${size}`}>
      <div className="caps-box" aria-hidden={!showTurn || undefined}>
        {showTurn && phase !== 'thinking' && last && (
          <p className={`caps-line caps-line--${last.role}${live ? ' is-live' : ' is-settled'}`} key={last.id}>
            <span className="caps-who">{last.role === 'user' ? 'You' : 'EchoFlow'}</span>
            <span className="caps-text">
              {text}
              {last.interrupted && <em> (cut off)</em>}
            </span>
          </p>
        )}
      </div>
      <p className="caps-hint">{hint}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

function buildTranscript(turns: readonly TranscriptTurn[], startedAt: number | null) {
  const t0 = startedAt ?? turns[0]?.at ?? Date.now()
  return turns
    .map((t) => `[${formatClock(t.at - t0)}] ${t.role === 'user' ? 'You' : 'EchoFlow'}: ${t.text || '(voice message)'}${t.interrupted ? ' (cut off)' : ''}`)
    .join('\n')
}

export function downloadTranscript(session: VoiceSession) {
  const body = `EchoFlow conversation\n${'-'.repeat(20)}\n${buildTranscript(session.turns, session.startedAt)}\n`
  const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'echoflow-conversation.txt'
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function TranscriptPanel({ session, open, onClose }: { session: VoiceSession; open: boolean; onClose: () => void }) {
  const { turns, startedAt } = session
  const listRef = useRef<HTMLOListElement>(null)
  const t0 = startedAt ?? turns[0]?.at ?? 0

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [turns, open])

  return (
    <aside className={`tr${open ? ' is-open' : ''}`} aria-label="Transcript" aria-hidden={!open || undefined} inert={!open || undefined}>
      <header className="tr-head">
        <h2>Transcript</h2>
        <div>
          <button type="button" className="icon-btn" onClick={() => downloadTranscript(session)} disabled={!turns.length} aria-label="Download transcript">
            <Download size={17} aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close transcript">
            <X size={17} aria-hidden="true" />
          </button>
        </div>
      </header>
      {turns.length === 0 ? (
        <p className="tr-empty">Your conversation will appear here as you talk.</p>
      ) : (
        <ol ref={listRef} className="tr-list">
          {turns.map((t) => (
            <li key={t.id} className={`tr-turn tr-turn--${t.role}`}>
              <div className="tr-meta">
                <span>{t.role === 'user' ? 'You' : 'EchoFlow'}</span>
                <span>{t.via === 'text' ? 'typed' : formatClock(t.at - t0)}</span>
              </div>
              <p>
                {t.text || <em>Voice message</em>}
                {t.interrupted && <em className="tr-cut"> (cut off)</em>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Dock: live controls
// ---------------------------------------------------------------------------

export function Dock({
  session,
  captionsOn,
  onCaptions,
  transcriptOpen,
  onTranscript,
  typeOpen,
  onType,
  volume,
  onVolume,
}: {
  session: VoiceSession
  captionsOn: boolean
  onCaptions: () => void
  transcriptOpen: boolean
  onTranscript: () => void
  typeOpen: boolean
  onType: () => void
  volume: number
  onVolume: (v: number) => void
}) {
  const { phase, muted, actions, textInput } = session
  const VolIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2
  return (
    <div className="dock" role="toolbar" aria-label="Conversation controls">
      <div className="dock-group">
        <button type="button" className={`dock-btn${muted ? ' is-on is-warn' : ''}`} aria-pressed={muted} onClick={() => actions.setMuted(!muted)}>
          {muted ? <MicOff size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
          <span>{muted ? 'Unmute' : 'Mute'}</span>
        </button>
        <button type="button" className={`dock-btn${captionsOn ? ' is-on' : ''}`} aria-pressed={captionsOn} onClick={onCaptions}>
          <CaptionsIcon size={20} aria-hidden="true" />
          <span>Captions</span>
        </button>
        <button type="button" className={`dock-btn${transcriptOpen ? ' is-on' : ''}`} aria-pressed={transcriptOpen} onClick={onTranscript}>
          <ScrollText size={20} aria-hidden="true" />
          <span>Transcript</span>
        </button>
        {textInput && (
          <button type="button" className={`dock-btn${typeOpen ? ' is-on' : ''}`} aria-pressed={typeOpen} onClick={onType}>
            <Keyboard size={20} aria-hidden="true" />
            <span>Type</span>
          </button>
        )}
      </div>

      <div className="dock-main">
        {phase === 'speaking' && (
          <button type="button" className="dock-stop" onClick={actions.interrupt}>
            <Square size={14} aria-hidden="true" fill="currentColor" /> Stop talking
          </button>
        )}
        <button type="button" className="dock-end" onClick={actions.end}>
          <PhoneOff size={20} aria-hidden="true" />
          <span>End</span>
        </button>
      </div>

      <div className="dock-group dock-group--vol">
        <label className="dock-vol">
          <VolIcon size={19} aria-hidden="true" />
          <span className="sr-only">EchoFlow’s volume</span>
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => onVolume(Number(e.target.value))} />
        </label>
      </div>
    </div>
  )
}

export function TypeBox({ onSend }: { onSend: (text: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <form
      className="typebox"
      onSubmit={(e) => {
        e.preventDefault()
        const text = value.trim()
        if (!text) return
        onSend(text)
        setValue('')
      }}
    >
      <label htmlFor="typed-message" className="sr-only">
        Type a message to EchoFlow
      </label>
      <input id="typed-message" type="text" autoComplete="off" maxLength={2000} value={value} placeholder="Type a message instead…" onChange={(e) => setValue(e.target.value)} />
      <button type="submit" className="typebox-send" disabled={!value.trim()} aria-label="Send message">
        <Send size={18} aria-hidden="true" />
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function SettingsDialog({
  locale,
  onLocale,
  voiceId,
  onVoice,
  captionSize,
  onCaptionSize,
  live,
}: {
  locale: string
  onLocale: (v: string) => void
  voiceId: string
  onVoice: (v: string) => void
  captionSize: CaptionSize
  onCaptionSize: (v: CaptionSize) => void
  live: boolean
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="icon-btn" aria-label="Settings">
        <Settings2 size={19} aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="va-overlay" />
        <Dialog.Content className="va-dialog" data-tone="ink" aria-describedby={undefined}>
          <div className="va-dialog-head">
            <Dialog.Title>Settings</Dialog.Title>
            <Dialog.Close className="icon-btn" aria-label="Close settings">
              <X size={18} aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="field">
            <label htmlFor="set-locale">Language</label>
            <select id="set-locale" value={locale} onChange={(e) => onLocale(e.target.value)}>
              {LOCALES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="set-voice">EchoFlow’s cloud voice</label>
            <select id="set-voice" value={voiceId} onChange={(e) => onVoice(e.target.value)}>
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          {live && <p className="field-note">Language and voice apply to your next conversation.</p>}

          <div className="field">
            <span id="cap-size-label">Caption size</span>
            <div className="seg" role="group" aria-labelledby="cap-size-label">
              {CAPTION_SIZES.map((s) => (
                <button key={s.id} type="button" aria-pressed={captionSize === s.id} onClick={() => onCaptionSize(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="shortcuts">
            <p>Keyboard shortcuts</p>
            <dl>
              <div>
                <dt>
                  <kbd>M</kbd>
                </dt>
                <dd>Mute or unmute</dd>
              </div>
              <div>
                <dt>
                  <kbd>C</kbd>
                </dt>
                <dd>Captions</dd>
              </div>
              <div>
                <dt>
                  <kbd>T</kbd>
                </dt>
                <dd>Transcript</dd>
              </div>
              <div>
                <dt>
                  <kbd>S</kbd>
                </dt>
                <dd>Stop EchoFlow talking</dd>
              </div>
            </dl>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ---------------------------------------------------------------------------
// Stage panels: idle, ended, error
// ---------------------------------------------------------------------------

export function IdlePanel({ onStart, onTextSend }: { onStart: () => void; onTextSend: (text: string) => void }) {
  return (
    <div className="panel panel--idle">
      <div className="panel-main">
        <h1 className="display panel-title">
          Talk it <em>through.</em>
        </h1>
        <p className="panel-lead">
          Ask EchoFlow a question. Start voice mode, or type below to get a reply without microphone access.
        </p>
        <button type="button" className="start-btn" onClick={onStart}>
          <Mic size={20} aria-hidden="true" />
          Start conversation
        </button>
        <div className="panel-text-fallback">
          <p className="panel-fine">Or send a text message without turning on your microphone.</p>
          <TypeBox onSend={onTextSend} />
        </div>
      </div>
      <div className="panel-side">
        <ol className="panel-notes">
          <li>Speak naturally. You can interrupt at any time.</li>
          <li>Captions and a transcript follow along.</li>
          <li>Mute, type or end whenever you like.</li>
        </ol>
        <p className="panel-fine">Microphone capture starts only after you press Start. Browser speech recognition may be processed by a browser-selected service.</p>
      </div>
    </div>
  )
}

export function EndedPanel({ session, onAgain }: { session: VoiceSession; onAgain: () => void }) {
  const { startedAt, endedAt, turns, endReason } = session
  const duration = startedAt && endedAt ? formatClock(endedAt - startedAt) : '00:00'
  const spoken = turns.filter((t) => t.text).length
  return (
    <div className="panel panel--ended">
      <p className="panel-kicker">{endReason === 'remote' ? 'Conversation finished' : 'You ended the conversation'}</p>
      <h1 className="display panel-title">
        Take it <em>one call at a time.</em>
      </h1>
      <dl className="panel-stats">
        <div>
          <dt>Length</dt>
          <dd>{duration}</dd>
        </div>
        <div>
          <dt>Messages</dt>
          <dd>{spoken}</dd>
        </div>
      </dl>
      <div className="panel-actions">
        <button type="button" className="start-btn" onClick={onAgain}>
          <RotateCcw size={20} aria-hidden="true" /> Talk again
        </button>
        <button type="button" className="panel-btn" onClick={() => downloadTranscript(session)} disabled={!turns.length}>
          <Download size={18} aria-hidden="true" /> Save transcript
        </button>
      </div>
      <p className="panel-fine">
        Remember: call back on a number you already trust, and never send money because of a call alone.{' '}
        <TLink to="/playbook">Open the playbook</TLink>
      </p>
    </div>
  )
}

export function ErrorPanel({ session, onRetry, onTextSend }: { session: VoiceSession; onRetry: () => void; onTextSend: (text: string) => void }) {
  const { error } = session
  if (!error) return null
  return (
    <div className="panel panel--error" role="alert">
      <span className="panel-icon">
        <ShieldAlert size={24} aria-hidden="true" />
      </span>
      <h1 className="display panel-title">{ERROR_TITLE[error.code]}</h1>
      <p className="panel-lead">{error.message}</p>
      {error.code === 'mic-denied' && (
        <ol className="panel-steps">
          <li>Click the lock or tune icon beside the web address.</li>
          <li>Set Microphone to “Allow”.</li>
          <li>Come back here and press Try again.</li>
        </ol>
      )}
      <div className="panel-actions">
        {error.recoverable && (
          <button type="button" className="start-btn" onClick={onRetry}>
            <RotateCcw size={20} aria-hidden="true" /> Try again
          </button>
        )}
        <TLink to="/help" className="panel-btn">
          <LifeBuoy size={18} aria-hidden="true" /> Get help
        </TLink>
      </div>
      <div className="panel-text-fallback">
        <p className="panel-fine">You can also continue by text without microphone access.</p>
        <TypeBox onSend={onTextSend} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Design review bar: jump to any state. Dev builds, or add ?states to the URL.
// ---------------------------------------------------------------------------

const STATE_BUTTONS: { label: string; phase: VoicePhase }[] = [
  { label: 'Idle', phase: 'idle' },
  { label: 'Connecting', phase: 'connecting' },
  { label: 'Listening', phase: 'listening' },
  { label: 'You speak', phase: 'user-speaking' },
  { label: 'Thinking', phase: 'thinking' },
  { label: 'EchoFlow speaks', phase: 'speaking' },
  { label: 'Reconnecting', phase: 'reconnecting' },
  { label: 'Ended', phase: 'ended' },
]

const ERROR_BUTTONS: { label: string; code: VoiceErrorCode }[] = [
  { label: 'Mic blocked', code: 'mic-denied' },
  { label: 'No mic', code: 'mic-no-device' },
  { label: 'Connection', code: 'connection-lost' },
]

export function StatesBar({ session }: { session: VoiceSession }) {
  const show = import.meta.env.DEV || new URLSearchParams(window.location.search).has('states')
  if (!show || !session.debug) return null
  const { forcePhase, forceError } = session.debug
  return (
    <details className="states">
      <summary>UI states</summary>
      <div className="states-body">
        <p>Preview any state of the page. Design review only.</p>
        <div className="states-row">
          {STATE_BUTTONS.map((b) => (
            <button key={b.phase} type="button" aria-pressed={session.phase === b.phase} onClick={() => forcePhase(b.phase)}>
              {b.label}
            </button>
          ))}
        </div>
        <div className="states-row">
          {ERROR_BUTTONS.map((b) => (
            <button key={b.code} type="button" aria-pressed={session.error?.code === b.code} onClick={() => forceError(b.code)}>
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </details>
  )
}
