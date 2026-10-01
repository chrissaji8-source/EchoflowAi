/**
 * The demo film, as a deterministic composition.
 *
 * `t` (seconds) fully determines every pixel, so the film can be rendered frame
 * by frame (see scripts/render-film.mjs) and encoded to public/media. It uses
 * the same phone screens as the site. Dev-only route: /__film
 *
 *   /__film?t=27      jump to a moment
 *   /__film?play      preview in real time
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import {
  ActiveCall,
  AlertSheet,
  AssistantScreen,
  CallBackScreen,
  DecideScreen,
  IncomingCall,
  MessagesScreen,
  PauseScreen,
  Phone,
  VerifyScreen,
  type Msg,
} from '../components/devices'
import { Mark } from '../components/Mark'
import '../styles/film.css'

export const FILM_DURATION = 76.5
const W = 1920
const H = 1080

const c01 = (x: number) => Math.min(1, Math.max(0, x))
const k = (t: number, a: number, b: number) => c01((t - a) / (b - a))
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
/** 0 -> 1 -> 0 window between a and b, with fades of length f. */
const win = (t: number, a: number, b: number, f = 0.4) => ease(k(t, a, a + f)) * (1 - ease(k(t, b - f, b)))
const typed = (text: string, t: number, start: number, cps: number) => text.slice(0, Math.max(0, Math.floor((t - start) * cps)))

type Cap = { a: number; b: number; text: string }
const CAPS: Cap[] = [
  { a: 9.3, b: 12.0, text: 'Aarav is calling.' },
  { a: 12.0, b: 14.4, text: 'Cadence asks first.' },
  { a: 14.9, b: 18.6, text: 'It sounds exactly like him.' },
  { a: 18.6, b: 22.5, text: 'The words don’t sit right.' },
  { a: 22.9, b: 27.6, text: 'Cadence noticed three things.' },
  { a: 27.6, b: 30.2, text: 'It didn’t decide anything.' },
  { a: 30.6, b: 34.2, text: 'So she took a breath.' },
  { a: 34.2, b: 36.2, text: 'Nothing had to happen yet.' },
  { a: 36.6, b: 40.2, text: 'She chose how to check.' },
  { a: 40.6, b: 43.8, text: 'Not the number that called.' },
  { a: 43.8, b: 47.6, text: 'The one saved for him.' },
  { a: 53.6, b: 56.6, text: 'She told the family.' },
  { a: 56.6, b: 59.2, text: 'Nobody sent anything.' },
  { a: 59.6, b: 64.0, text: 'It wasn’t him.' },
  { a: 64.4, b: 68.0, text: 'Nothing was blocked. Nothing was decided for her.' },
  { a: 68.0, b: 70.8, text: 'And she could talk it through.' },
]

const SLUGS = [
  { a: 9, b: 30, n: 'Scene two', text: 'Kitchen, 2:14 pm' },
  { a: 30, b: 47.8, n: 'Scene three', text: 'Kitchen, two minutes later' },
  { a: 53, b: 64.6, n: 'Scene four', text: 'The family chat' },
  { a: 64.4, b: 71, n: 'Scene five', text: 'Cadence voice' },
]

const L1 = 'Mum? It’s me.'
const L2 = 'I’m in trouble. Please don’t tell Dad.'
const L3 = 'I need money. Right now.'

const THREAD: { at: number; msg: Msg }[] = [
  { at: 53.9, msg: { from: 'me', text: 'Someone just called me sounding exactly like Aarav, asking for money.' } },
  { at: 55.6, msg: { from: 'them', who: 'Aarav', text: 'That wasn’t me! I’m in class right now.' } },
  { at: 57.3, msg: { from: 'them', who: 'Papa', text: 'Don’t send anything. Call me.' } },
  { at: 58.6, msg: { from: 'me', text: 'I called his real number. He’s fine.' } },
]

function Layer({ t, a, b, fade = 0.35, style, children }: { t: number; a: number; b: number; fade?: number; style?: CSSProperties; children: ReactNode }) {
  const o = win(t, a, b, fade)
  if (o <= 0.001) return null
  return (
    <div className="fm-layer" style={{ opacity: o, ...style }}>
      {children}
    </div>
  )
}

function Card({ o, children, className = '' }: { o: number; children: ReactNode; className?: string }) {
  if (o <= 0.001) return null
  return (
    <div className={`fm-card ${className}`} style={{ opacity: o }}>
      {children}
    </div>
  )
}

export function FilmFrame({ t }: { t: number }) {
  // --- phone -----------------------------------------------------------------
  const phoneA = win(t, 8.4, 47.9, 0.6)
  const phoneB = win(t, 52.8, 71.0, 0.6)
  const phoneO = Math.max(phoneA, phoneB)
  const push = t < 50 ? 1 + 0.035 * k(t, 8.4, 47.9) : 1 + 0.03 * k(t, 52.8, 71)
  const ringing = t > 9.6 && t < 12.4 ? Math.sin(t * 70) * 3.2 : 0

  const callSeconds = Math.max(0, Math.floor(t - 14.3) + 3)
  const callClock = `00:${String(callSeconds).padStart(2, '0')}`
  const live = t < 14.9 ? '' : t < 16.9 ? typed(L1, t, 14.9, 18) : t < 19.7 ? typed(L2, t, 16.9, 22) : typed(L3, t, 19.7, 18)

  const msgs = THREAD.filter((m) => t >= m.at).map((m) => m.msg)
  const nextMsg = THREAD.find((m) => t < m.at)
  const typing = !!nextMsg && nextMsg.at - t < 1.1 && nextMsg.msg.from === 'them'

  const assistText = typed('I’m really glad you stopped to check. Calling him back was exactly the right move.', t, 65.2, 17)

  // --- global fades ----------------------------------------------------------
  const fromBlack = 1 - ease(k(t, 0, 0.5))
  const toBlack = ease(k(t, 75.6, 76.5))

  return (
    <div className="fm" style={{ '--bt': t.toFixed(3) } as CSSProperties}>
      {/* title card */}
      <Card o={win(t, 0.3, 4.9, 1.0)} className="fm-title">
        <h1 style={{ letterSpacing: `${0.46 - 0.12 * k(t, 0, 5)}em` }}>Cadence</h1>
        <p>a short film about a pause</p>
      </Card>

      {/* intertitle one */}
      <Card o={win(t, 5.0, 8.9, 0.6)} className="fm-inter">
        <div className="fm-inter-frame" />
        <p>A quiet afternoon.</p>
        <small>2:14 in the afternoon. A call from her son.</small>
      </Card>

      {/* intertitle two */}
      <Card o={win(t, 48.0, 52.8, 0.6)} className="fm-inter">
        <div className="fm-inter-frame" />
        <p>“Mum? I’m at college. Everything’s fine.”</p>
        <small>Aarav, on the number she had saved.</small>
      </Card>

      {/* end card */}
      <Card o={win(t, 71.2, 76.6, 0.8)} className="fm-end">
        <p>
          Make room for <em>a second thought.</em>
        </p>
        <div className="fm-end-mark" style={{ opacity: k(t, 73.6, 74.6) }}>
          <Mark size={30} />
          <span>Cadence</span>
        </div>
      </Card>

      {/* left: slug + narration */}
      {SLUGS.map((s) => {
        const o = win(t, s.a, s.b, 0.5)
        return o > 0.01 ? (
          <div key={s.a} className="fm-slug" style={{ opacity: o }}>
            <span>{s.n}</span>
            <span>{s.text}</span>
          </div>
        ) : null
      })}
      <div className="fm-caps">
        {CAPS.map((c) => {
          const w = win(t, c.a, c.b, 0.6)
          if (w <= 0.001) return null
          return (
            <p key={c.a} className={`fm-cap${c.text.length > 30 ? ' fm-cap--long' : ''}`} style={{ opacity: w, filter: `blur(${((1 - w) * 16).toFixed(1)}px)`, transform: `translateY(${((1 - w) * 18).toFixed(1)}px)` }}>
              {c.text}
            </p>
          )
        })}
      </div>

      {/* right: the phone */}
      {phoneO > 0.001 && (
        <div
          className="fm-phone"
          style={{
            opacity: phoneO,
            transform: `translate(${ringing}px, ${((1 - phoneO) * 70).toFixed(1)}px) scale(${push.toFixed(4)})`,
          }}
        >
          <div className="fm-marks" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <Phone width={455}>
            <Layer t={t} a={8.6} b={14.9}>
              <IncomingCall banner={t > 12.0 ? 'ask' : null} pressed={t > 14.1} />
            </Layer>
            <Layer t={t} a={14.6} b={23.4}>
              <ActiveCall strip="listening" time={callClock} captions={live || '…'} />
            </Layer>
            <Layer t={t} a={23.0} b={30.6} style={{ '--s': k(t, 23.3, 29.2).toFixed(4) } as CSSProperties}>
              <AlertSheet pressed={t > 29.7} />
            </Layer>
            <Layer t={t} a={30.3} b={36.8} style={{ '--cd': (0.04 + 0.3 * ease(k(t, 30.5, 36.6))).toFixed(4) } as CSSProperties}>
              <PauseScreen />
            </Layer>
            <Layer t={t} a={36.4} b={42.8}>
              <VerifyScreen pick={t > 39.8 ? 0 : -1} />
            </Layer>
            <Layer t={t} a={42.4} b={48.0}>
              <CallBackScreen ringing={t < 46.6} />
            </Layer>
            <Layer t={t} a={53.0} b={59.9}>
              <MessagesScreen title="Family" sub="4 people" messages={msgs} typing={typing} />
            </Layer>
            <Layer t={t} a={59.4} b={64.9}>
              <DecideScreen />
            </Layer>
            <Layer t={t} a={64.4} b={71.0}>
              <AssistantScreen caption={assistText || '…'} />
            </Layer>
          </Phone>
        </div>
      )}

      <i className="fm-black" style={{ opacity: Math.max(fromBlack, toBlack) }} />
    </div>
  )
}

export default function Film() {
  const params = new URLSearchParams(window.location.search)
  const [t, setT] = useState(() => Number(params.get('t') ?? 0))
  const [scale, setScale] = useState(1)

  useEffect(() => {
    document.documentElement.classList.add('film-mode')
    ;(window as unknown as { __setT: (v: number) => void }).__setT = (v: number) => flushSync(() => setT(v))
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H))
    fit()
    window.addEventListener('resize', fit)
    return () => {
      document.documentElement.classList.remove('film-mode')
      window.removeEventListener('resize', fit)
    }
  }, [])

  useEffect(() => {
    if (!params.has('play')) return
    let raf = 0
    const t0 = performance.now() - t * 1000
    const tick = (now: number) => {
      const v = ((now - t0) / 1000) % FILM_DURATION
      setT(v)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fm-viewport">
      <div className="fm-scale" style={{ transform: `scale(${scale})` }}>
        <FilmFrame t={t} />
      </div>
    </div>
  )
}
