/**
 * Device library: a realistic phone and the screens Cadence lives on.
 *
 * Everything is sized in `em`, and the phone sets its own font-size from its
 * width (1em = width / 24.4, so 16px at a 390px phone). Any screen therefore
 * scales cleanly from a gallery thumbnail to a full film frame.
 *
 * Animation hooks: screens read the CSS variable `--s` (0..1, default 1). A
 * scroll scene or the film renderer sets it; the screens need no JavaScript.
 */
import { createContext, useContext, type CSSProperties, type ReactNode } from 'react'
import {
  Bell,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flashlight,
  Grid3x3,
  Info,
  KeyRound,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  Phone as PhoneGlyph,
  PhoneOff,
  Plus,
  Send,
  Star,
  UserPlus,
  Users,
  Video,
  Volume2,
} from 'lucide-react'
import { Mark } from './Mark'

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function Phone({
  width = 320,
  className = '',
  style,
  children,
}: {
  width?: number | string
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const pw = typeof width === 'number' ? `${width}px` : width
  return (
    <div className={`phone ${className}`} style={{ '--pw': pw, ...style } as CSSProperties} aria-hidden="true">
      <div className="phone-screen">
        {children}
        <i className="phone-island" />
      </div>
      <i className="phone-btn phone-btn--action" />
      <i className="phone-btn phone-btn--up" />
      <i className="phone-btn phone-btn--down" />
      <i className="phone-btn phone-btn--power" />
    </div>
  )
}

/** The time shown in every status bar. The story happens at 2:14. */
export const PhoneClock = createContext('2:14')

function StatusBar({ time }: { time?: string }) {
  const clock = useContext(PhoneClock)
  return (
    <div className="sb">
      <span className="sb-time">{time ?? clock}</span>
      <span className="sb-icons">
        <svg viewBox="0 0 18 12" aria-hidden="true">
          <rect x="0" y="8" width="3" height="4" rx="0.6" fill="currentColor" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="0.6" fill="currentColor" />
          <rect x="10" y="3" width="3" height="9" rx="0.6" fill="currentColor" />
          <rect x="15" y="0" width="3" height="12" rx="0.6" fill="currentColor" />
        </svg>
        <svg viewBox="0 0 17 12" aria-hidden="true">
          <path d="M8.5 2.2c2.3 0 4.4.9 6 2.4l1-1.1A9.5 9.5 0 0 0 8.5.7 9.5 9.5 0 0 0 1.5 3.5l1 1.1a8.3 8.3 0 0 1 6-2.4Z" fill="currentColor" />
          <path d="M8.5 5.8c1.3 0 2.5.5 3.4 1.3l1-1.1a6.6 6.6 0 0 0-8.8 0l1 1.1c.9-.8 2.1-1.3 3.4-1.3Z" fill="currentColor" />
          <path d="M8.5 9.3c.6 0 1.1.2 1.5.6L8.5 11.5 7 9.9c.4-.4.9-.6 1.5-.6Z" fill="currentColor" />
        </svg>
        <svg viewBox="0 0 27 12" aria-hidden="true">
          <rect x="0.5" y="0.5" width="22" height="11" rx="3.2" fill="none" stroke="currentColor" opacity="0.45" />
          <rect x="2" y="2" width="16.5" height="8" rx="1.8" fill="currentColor" />
          <rect x="24" y="4" width="2" height="4" rx="1" fill="currentColor" opacity="0.5" />
        </svg>
      </span>
    </div>
  )
}

type Tone = 'dark' | 'light'

function Screen({
  tone = 'dark',
  time,
  className = '',
  children,
}: {
  tone?: Tone
  time?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`scr scr--${tone} ${className}`}>
      <StatusBar time={time} />
      {children}
      <i className="home-ind" />
    </div>
  )
}

function Bars({ n = 5 }: { n?: number }) {
  return (
    <span className="bars" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} style={{ '--i': i } as CSSProperties} />
      ))}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Cadence pieces that appear inside other screens
// ---------------------------------------------------------------------------

export function CadenceBanner({ mode = 'ask', pressed = false }: { mode?: 'ask' | 'listening'; pressed?: boolean }) {
  return (
    <div className={`cb cb--${mode}`}>
      <span className="cb-mark">
        <Mark size={18} />
      </span>
      <div className="cb-text">
        <b>Cadence</b>
        <span>{mode === 'ask' ? 'Listen to this call?' : 'Listening to this call'}</span>
      </div>
      {mode === 'ask' ? (
        <div className="cb-actions">
          <span className={`cb-btn cb-btn--solid${pressed ? ' is-pressed' : ''}`}>Allow</span>
          <span className="cb-btn">Not now</span>
        </div>
      ) : (
        <Bars n={4} />
      )}
    </div>
  )
}

type StripState = 'listening' | 'alert' | 'quiet'

function CadenceStrip({ state = 'listening', label: override }: { state?: StripState; label?: string }) {
  const label = override ?? (state === 'listening' ? 'Cadence is listening' : state === 'alert' ? 'Worth a second look' : 'No strong signal')
  return (
    <div className={`cs cs--${state}`}>
      <Mark size={16} />
      <span className="cs-label">{label}</span>
      {state === 'alert' ? <ChevronRight size={15} /> : <Bars n={5} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

export function IncomingCall({
  name = 'Aarav',
  sub = 'mobile',
  banner = null,
  pressed = false,
  time,
}: {
  name?: string
  sub?: string
  banner?: 'ask' | 'listening' | null
  pressed?: boolean
  time?: string
}) {
  return (
    <Screen tone="dark" time={time} className="scr-incoming">
      {banner && (
        <div className="scr-banner">
          <CadenceBanner mode={banner} pressed={pressed} />
        </div>
      )}
      <div className="ic-id">
        <span className="ic-sub">{sub}</span>
        <span className="ic-name">{name}</span>
      </div>
      <div className="ic-small">
        <div>
          <span>
            <Clock size={18} />
          </span>
          Remind Me
        </div>
        <div>
          <span>
            <MessageSquare size={18} />
          </span>
          Message
        </div>
      </div>
      <div className="ic-main">
        <div className="ic-btn">
          <span className="ic-btn-c ic-btn-c--decline">
            <PhoneOff size={24} />
          </span>
          Decline
        </div>
        <div className="ic-btn">
          <span className="ic-btn-c ic-btn-c--accept">
            <PhoneGlyph size={24} />
          </span>
          Accept
        </div>
      </div>
    </Screen>
  )
}

export function ActiveCall({
  name = 'Aarav',
  time = '00:14',
  strip = 'listening',
  captions,
  dim = false,
  stripLabel,
}: {
  name?: string
  time?: string
  strip?: StripState | null
  captions?: ReactNode
  dim?: boolean
  /** Replaces the strip's default wording, e.g. for the "mixed signals" state. */
  stripLabel?: string
}) {
  const tiles = [
    [MicOff, 'mute'],
    [Grid3x3, 'keypad'],
    [Volume2, 'speaker'],
    [UserPlus, 'add call'],
    [Video, 'FaceTime'],
    [Users, 'contacts'],
  ] as const
  return (
    <Screen tone="dark" className="scr-active">
      {strip && (
        <div className="scr-banner">
          <CadenceStrip state={strip} label={stripLabel} />
        </div>
      )}
      <div className="ac-id">
        <span className="ac-name">{name}</span>
        <span className="ac-time">{time}</span>
      </div>
      {captions !== undefined && (
        <div className="ac-caps">
          <small>Live captions</small>
          <p>{captions}</p>
        </div>
      )}
      <div className="ac-grid">
        {tiles.map(([Icon, label]) => (
          <div key={label} className="ac-tile">
            <span>
              <Icon size={22} />
            </span>
            {label}
          </div>
        ))}
      </div>
      <div className="ac-end">
        <span>
          <PhoneOff size={26} />
        </span>
      </div>
      {dim && <i className="scr-dim" />}
    </Screen>
  )
}

export function AlertSheet({ pressed = false }: { pressed?: boolean }) {
  return (
    <div className="scr scr--dark scr-alert">
      <ActiveCall strip="alert" dim />
      <div className="sheet">
        <i className="sheet-grab" />
        <div className="sheet-head">
          <span className="sheet-brand">
            <Mark size={16} /> Cadence
          </span>
          <span>now</span>
        </div>
        <h3 className="sheet-title">Worth a second look</h3>
        <p className="sheet-lead">This call has things in common with voice-clone scams.</p>
        <ul className="obs">
          <li style={{ '--o': 0 } as CSSProperties}>
            <span>
              <Check size={13} />
            </span>
            Urgent request for money
          </li>
          <li style={{ '--o': 1 } as CSSProperties}>
            <span>
              <Check size={13} />
            </span>
            Asked to keep it secret
          </li>
          <li style={{ '--o': 2 } as CSSProperties}>
            <span>
              <Check size={13} />
            </span>
            Voice pattern: unusually smooth
          </li>
        </ul>
        <div className="meter">
          <span>Signal</span>
          <b>
            <i />
          </b>
          <em>Moderate</em>
        </div>
        <p className="sheet-note">A signal, never proof of who is calling.</p>
        <div className="sheet-actions">
          <span className={`sa sa--solid${pressed ? ' is-pressed' : ''}`}>Hang up &amp; call back</span>
          <span className="sa">Keep talking</span>
        </div>
      </div>
    </div>
  )
}

export function PauseScreen({ name = 'Aarav' }: { name?: string }) {
  return (
    <Screen tone="light" className="scr-pause">
      <div className="ps-top">
        <Mark size={16} /> Cadence
      </div>
      <div className="ps-ring">
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" />
          <circle cx="60" cy="60" r="54" className="fill" pathLength="100" />
        </svg>
        <div>
          <strong aria-hidden="true" />
          <span>seconds</span>
        </div>
      </div>
      <h3 className="ps-title">
        Take a <em>breath.</em>
      </h3>
      <p className="ps-copy">
        {name} will still be there in ninety seconds. Hold off on money, codes and personal details until you have checked.
      </p>
      <div className="ps-foot">
        <span className="ps-btn">I’m ready</span>
        <small>Nothing has been blocked.</small>
      </div>
    </Screen>
  )
}

export function VerifyScreen({ name = 'Aarav', pick = -1 }: { name?: string; pick?: number }) {
  const rows = [
    [PhoneGlyph, `Call ${name} on the saved number`, '+91 98765 43210, saved contact'],
    [KeyRound, 'Ask for the family safe word', 'Only the real person will know it'],
    [MessageSquare, 'Message the family group', 'Family, 4 people'],
    [Star, 'Ask a question only they would know', 'Not something on their profile'],
  ] as const
  return (
    <Screen tone="dark" className="scr-verify">
      <div className="nav-top">
        <span>
          <ChevronLeft size={20} /> Back
        </span>
        <b>Verify</b>
        <span />
      </div>
      <h3 className="vs-title">
        Check it’s really <em>{name}.</em>
      </h3>
      <p className="vs-lead">Pick the way that suits you. You stay in control.</p>
      <ul className="vs-list">
        {rows.map(([Icon, title, sub], i) => (
          <li key={title} className={pick === i ? 'is-picked' : undefined}>
            <span className="vs-icon">
              <Icon size={18} />
            </span>
            <div>
              <b>{title}</b>
              <small>{sub}</small>
            </div>
            {pick === i ? <Check size={18} /> : <ChevronRight size={18} />}
          </li>
        ))}
      </ul>
    </Screen>
  )
}

export function CallBackScreen({ name = 'Aarav', ringing = true }: { name?: string; ringing?: boolean }) {
  return (
    <Screen tone="dark" className="scr-callback">
      <div className="cbk-top">
        <small>{ringing ? 'Calling saved contact' : 'Connected'}</small>
        <span className="cbk-avatar">
          <i>{name[0]}</i>
        </span>
        <span className="cbk-name">{name}</span>
        <span className="cbk-state">{ringing ? 'mobile, ringing' : '00:03'}</span>
      </div>
      <div className="cbk-compare">
        <div className="cbk-row cbk-row--bad">
          <small>The number that called</small>
          <b>+1 (415) 555 0188</b>
          <em>Not in your contacts</em>
        </div>
        <div className="cbk-row cbk-row--good">
          <small>Saved for {name}</small>
          <b>+91 98765 43210</b>
          <em>Saved contact</em>
        </div>
      </div>
      <div className="ac-end">
        <span>
          <PhoneOff size={26} />
        </span>
      </div>
    </Screen>
  )
}

export function DecideScreen({ name = 'Aarav' }: { name?: string }) {
  return (
    <Screen tone="light" className="scr-decide">
      <div className="ps-top">
        <Mark size={16} /> Cadence
      </div>
      <div className="dc-check">
        <Check size={30} />
      </div>
      <h3 className="ps-title">
        It’s your <em>call.</em>
      </h3>
      <p className="ps-copy">Nothing was blocked. Nothing was decided for you. What did you find out?</p>
      <div className="dc-choices">
        <span>It was {name}</span>
        <span className="is-solid">It wasn’t {name}</span>
      </div>
      <ul className="dc-next">
        <li>
          <b>Tell someone you trust</b>
          <ChevronRight size={16} />
        </li>
        <li>
          <b>Report the call</b>
          <ChevronRight size={16} />
        </li>
        <li>
          <b>Talk it through with Cadence</b>
          <ChevronRight size={16} />
        </li>
      </ul>
    </Screen>
  )
}

/** With `scrub`, the three switches read `--t1`..`--t3` (0..1) from an ancestor, so a scroll scene can flip them. */
export function ConsentScreen({ scrub = false }: { scrub?: boolean }) {
  const tg = (n: number, on: boolean) => (
    <i className={scrub ? 'tg tg--scrub' : `tg${on ? ' is-on' : ''}`} style={scrub ? ({ '--t': `var(--t${n}, 0)` } as CSSProperties) : undefined} />
  )
  return (
    <Screen tone="light" className="scr-consent">
      <div className="cn-mark">
        <Mark size={34} />
      </div>
      <h3 className="cn-title">
        Listen to <em>this call?</em>
      </h3>
      <p className="cn-copy">Cadence can listen for patterns that sometimes appear in cloned voices, and tell you in plain words what it notices.</p>
      <ul className="cn-list">
        <li>
          <div>
            <b>This call only</b>
            <small>Ask me again next time</small>
          </div>
          {tg(1, true)}
        </li>
        <li>
          <div>
            <b>Keep no audio</b>
            <small>Discarded when the call ends</small>
          </div>
          {tg(2, true)}
        </li>
        <li>
          <div>
            <b>Show what I hear</b>
            <small>Live captions on screen</small>
          </div>
          {tg(3, false)}
        </li>
      </ul>
      <div className="cn-foot">
        <span className="ps-btn ps-btn--solid">Allow for this call</span>
        <span className="ps-btn">Not now</span>
        <small>How Cadence handles audio</small>
      </div>
    </Screen>
  )
}

export function RecentsScreen() {
  const rows = [
    ['+1 (415) 555 0188', 'mobile', 'Second look', '2:14 PM'],
    ['Aarav', 'mobile', 'Verified by you', '2:19 PM'],
    ['Mum', 'mobile', '', 'Yesterday'],
    ['Dr Mehta Clinic', 'work', '', 'Tuesday'],
    ['Unknown', 'voicemail', '', 'Monday'],
    ['Aarav', 'mobile', '', 'Sunday'],
  ]
  return (
    <Screen tone="dark" className="scr-recents">
      <div className="rc-top">
        <span>Edit</span>
        <div className="rc-seg">
          <b>All</b>
          <span>Missed</span>
        </div>
        <span />
      </div>
      <h3 className="rc-title">Recents</h3>
      <ul className="rc-list">
        {rows.map(([name, kind, tag, when], i) => (
          <li key={i} className={tag === 'Second look' ? 'is-flag' : undefined}>
            <div>
              <b>{name}</b>
              <small>
                {kind}
                {tag && <em>{tag}</em>}
              </small>
            </div>
            <span>{when}</span>
            <Info size={17} />
          </li>
        ))}
      </ul>
    </Screen>
  )
}

export type Msg = { from: 'me' | 'them'; text: string; who?: string }

export function MessagesScreen({
  title = 'Family',
  sub = '4 people',
  messages,
  typing = false,
}: {
  title?: string
  sub?: string
  messages: Msg[]
  typing?: boolean
}) {
  return (
    <Screen tone="dark" className="scr-messages">
      <div className="ms-top">
        <ChevronLeft size={22} />
        <div className="ms-head">
          <span className="ms-avatar">{title[0]}</span>
          <b>{title}</b>
          <small>{sub}</small>
        </div>
        <Video size={20} />
      </div>
      <div className="ms-thread">
        {messages.map((m, i) => (
          <div key={i} className={`ms-row ms-row--${m.from}`}>
            {m.who && <small>{m.who}</small>}
            <p>{m.text}</p>
          </div>
        ))}
        {typing && (
          <div className="ms-row ms-row--them">
            <p className="ms-typing">typing</p>
          </div>
        )}
      </div>
      <div className="ms-input">
        <span>
          <Plus size={18} />
        </span>
        <div>Message</div>
        <span>
          <Send size={16} />
        </span>
      </div>
    </Screen>
  )
}

export function LockScreen({ time = '2:14', extra }: { time?: string; extra?: boolean }) {
  return (
    <Screen tone="dark" time="" className="scr-lock">
      <div className="lk-date">
        <small>Tuesday 30 September</small>
        <strong>{time}</strong>
      </div>
      <div className="lk-notes">
        <div className="lk-note lk-note--cad">
          <span className="lk-app">
            <Mark size={14} /> Cadence <em>now</em>
          </span>
          <b>Worth a second look</b>
          <p>An incoming call shows signs common to voice-clone scams. Open for what to do next.</p>
        </div>
        {extra !== false && (
          <div className="lk-note">
            <span className="lk-app">
              <MessageSquare size={14} /> Messages <em>2m ago</em>
            </span>
            <b>Mum</b>
            <p>Did you just try to call me? Ring me when you can.</p>
          </div>
        )}
      </div>
      <div className="lk-foot">
        <span>
          <Flashlight size={20} />
        </span>
        <span>
          <Camera size={20} />
        </span>
      </div>
    </Screen>
  )
}

export function SettingsScreen() {
  return (
    <Screen tone="light" className="scr-settings">
      <div className="st-top">
        <span>
          <ChevronLeft size={20} /> Settings
        </span>
      </div>
      <h3 className="st-title">Cadence</h3>
      <div className="st-group">
        <div className="st-row">
          <b>Ask before listening</b>
          <span className="st-lock">
            Always <Lock size={13} />
          </span>
        </div>
        <div className="st-row">
          <b>Keep audio</b>
          <span>Never</span>
        </div>
        <div className="st-row">
          <b>Live captions</b>
          <i className="tg is-on" />
        </div>
      </div>
      <p className="st-cap">Cadence asks every time, and keeps nothing once a call ends.</p>
      <div className="st-group">
        <div className="st-row">
          <b>Language</b>
          <span>English (India)</span>
        </div>
        <div className="st-row">
          <b>Reduce motion</b>
          <span>Match system</span>
        </div>
        <div className="st-row">
          <b>Verification contacts</b>
          <span>4</span>
        </div>
      </div>
      <div className="st-group st-group--danger">
        <div className="st-row">
          <b>Delete my data</b>
          <ChevronRight size={16} />
        </div>
      </div>
    </Screen>
  )
}

export function NotesScreen({ title = 'Family safe word', lines }: { title?: string; lines: string[] }) {
  return (
    <Screen tone="light" className="scr-notes">
      <div className="nt-top">
        <span>
          <ChevronLeft size={20} /> Notes
        </span>
        <Lock size={17} />
      </div>
      <h3 className="nt-title">{title}</h3>
      <small className="nt-meta">Locked note, edited today</small>
      <div className="nt-body">
        {lines.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>
    </Screen>
  )
}

export function ContactsScreen() {
  const rows = [
    ['Mum', 'Safe word set', true],
    ['Papa', 'Safe word set', true],
    ['Aarav', 'Safe word set', true],
    ['Nani', 'Not set up yet', false],
  ] as const
  return (
    <Screen tone="light" className="scr-contacts">
      <div className="st-top">
        <span>
          <ChevronLeft size={20} /> Cadence
        </span>
      </div>
      <h3 className="st-title">Trusted circle</h3>
      <p className="ct-lead">People you can check with when a call feels wrong.</p>
      <ul className="ct-list">
        {rows.map(([name, state, ok]) => (
          <li key={name}>
            <span className="ct-avatar">{name[0]}</span>
            <div>
              <b>{name}</b>
              <small>{state}</small>
            </div>
            {ok ? <Check size={18} /> : <span className="ct-invite">Invite</span>}
          </li>
        ))}
      </ul>
      <div className="ct-foot">
        <span className="ps-btn ps-btn--solid">Add someone</span>
        <small>Only they see your safe word, and only in person.</small>
      </div>
    </Screen>
  )
}

export function ReportScreen() {
  const rows = [
    ['National Cyber Crime Portal', 'India, helpline 1930'],
    ['ReportFraud.ftc.gov', 'United States'],
    ['Your bank’s fraud line', 'The number on your card'],
  ]
  return (
    <Screen tone="light" className="scr-report">
      <div className="st-top">
        <span>
          <ChevronLeft size={20} /> Back
        </span>
      </div>
      <h3 className="st-title">Report the call</h3>
      <p className="ct-lead">Reports help other people, and can help get money back. Choose where to send it.</p>
      <div className="st-group">
        {rows.map(([title, sub]) => (
          <div key={title} className="st-row st-row--two">
            <div>
              <b>{title}</b>
              <small>{sub}</small>
            </div>
            <ChevronRight size={16} />
          </div>
        ))}
      </div>
      <div className="rp-card">
        <small>Call details, ready to copy</small>
        <b>+1 (415) 555 0188</b>
        <span>Today, 2:14 PM. Asked for money. Asked to keep it secret.</span>
      </div>
      <div className="ct-foot">
        <span className="ps-btn ps-btn--solid">Copy details</span>
      </div>
    </Screen>
  )
}

export function AssistantScreen({ caption = 'I’m really glad you stopped to check.', who = 'Cadence', phase = 'speaking' }: { caption?: string; who?: string; phase?: 'speaking' | 'listening' }) {
  const n = 46
  const lane = (key: 'you' | 'ai', label: string, offset: number) => (
    <div className={`as-lane as-lane--${key}`}>
      <b>{label}</b>
      {Array.from({ length: n }, (_, i) => {
        const u = (i + offset + 0.5) / n
        const env = 0.25 + 0.75 * Math.abs(Math.sin(u * 17) * Math.cos(u * 6.3 + 0.8))
        return <i key={i} style={{ '--e': env.toFixed(3), '--i': i } as CSSProperties} />
      })}
    </div>
  )
  return (
    <Screen tone="dark" className="scr-assistant">
      <div className="as-top">
        <Mark size={16} /> Cadence <em>voice</em>
      </div>
      <p className="as-state">
        {phase === 'speaking' ? 'Cadence' : 'Listening'}
        <span>.</span>
      </p>
      <div className={`as-tracks as-tracks--${phase}`}>
        {lane('you', 'You', 0)}
        {lane('ai', 'Cadence', 11)}
        <span className="as-head" />
      </div>
      <div className="as-caps">
        <small>{who}</small>
        <p>{caption}</p>
      </div>
      <div className="as-dock">
        <span>
          <Mic size={20} />
        </span>
        <span className="as-end">
          <PhoneOff size={22} />
        </span>
        <span>
          <Bell size={20} />
        </span>
      </div>
    </Screen>
  )
}
