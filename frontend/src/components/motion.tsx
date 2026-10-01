import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from 'react'
import { prefersReducedMotion, subscribeScroll, useReducedMotion, useReveal, useScrub } from '../lib/scrub'
import { Phone } from './devices'

/** Typed helper for passing CSS custom properties through `style`. */
export const vars = (v: Record<string, string | number>) => v as CSSProperties

// ---------------------------------------------------------------------------
// Reveal: a rack focus. The element starts soft and low, and pulls sharp once
// when it is scrolled into view.
// ---------------------------------------------------------------------------

export function Reveal({
  as,
  delay = 0,
  className = '',
  children,
}: {
  as?: ElementType
  delay?: number
  className?: string
  children: ReactNode
}) {
  const Tag = (as ?? 'div') as ElementType
  const ref = useReveal<HTMLElement>()
  return (
    <Tag ref={ref} className={className} data-reveal="" style={vars({ '--d': `${delay}ms` })}>
      {children}
    </Tag>
  )
}

// ---------------------------------------------------------------------------
// ScrubText: words light up one by one as the block travels through the
// viewport (mode 'view'), or along with the enclosing pinned <Scene> (mode 'pin',
// which reads the scene's `--p` instead of measuring itself).
// ---------------------------------------------------------------------------

export function ScrubText({
  text,
  as,
  mode = 'view',
  className = '',
  accent = [],
}: {
  text: string
  as?: ElementType
  mode?: 'view' | 'pin'
  className?: string
  /** Words (lowercase, no punctuation) to render in italic. */
  accent?: string[]
}) {
  const Tag = (as ?? 'p') as ElementType
  const ref = useScrub<HTMLElement>({ mode: mode === 'view' ? 'view' : 'none' })
  const words = text.split(' ')
  return (
    <Tag ref={ref} className={`scrub-text scrub-text--${mode} ${className}`} style={vars({ '--n': words.length })} aria-label={text}>
      {words.map((word, i) => {
        const key = word.toLowerCase().replace(/[^a-z']/g, '')
        return (
          <span
            key={i}
            aria-hidden="true"
            className={`scrub-word${accent.includes(key) ? ' scrub-word--accent' : ''}`}
            style={vars({ '--i': i })}
          >
            {word}{' '}
          </span>
        )
      })}
    </Tag>
  )
}

// ---------------------------------------------------------------------------
// ScrubType: text that is typed out by the scene's scroll position, between
// progress `a` and `b`. Used for live call captions.
// ---------------------------------------------------------------------------

export function ScrubType({ text, a, b, className = '' }: { text: string; a: number; b: number; className?: string }) {
  // Live captions arrive a word at a time, so each word is the unit.
  const words = text.split(' ')
  return (
    <span className={`stype ${className}`} style={vars({ '--a': a, '--b': b, '--n': words.length })} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden="true" style={vars({ '--i': i })}>
          {w}{' '}
        </span>
      ))}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Scene: a tall wrapper whose child `.scene-stage` sticks to the viewport.
// Scrolling through the wrapper scrubs `--p` (0..1) and, with `steps`, `data-step`.
// ---------------------------------------------------------------------------

export function Scene({
  steps,
  length = 100,
  tone = 'ink',
  className = '',
  id,
  label,
  chapter,
  children,
}: {
  /** Number of discrete steps; enables `data-step`. */
  steps?: number
  /** Extra scroll distance in vh on top of the one-viewport stage. */
  length?: number
  tone?: 'ink' | 'paper'
  className?: string
  id?: string
  label?: string
  /** Name shown on the timeline when this scene is playing. */
  chapter?: string
  children: ReactNode
}) {
  const ref = useScrub<HTMLElement>({ mode: 'pin', steps })
  return (
    <section
      ref={ref}
      id={id}
      aria-label={label}
      data-tone={tone}
      data-chapter={chapter}
      data-step={steps ? 0 : undefined}
      className={`scene ${className}`}
      style={vars({ '--len': length })}
    >
      <div className="scene-stage">{children}</div>
    </section>
  )
}

/**
 * Shot: one layer of a scene. It is fully visible between progress `a` and `b`
 * and dissolves in and out over `f`. `--k` inside is the shot's own 0..1 progress.
 */
export function Shot({
  a,
  b,
  f = 0.05,
  className = '',
  style,
  children,
}: {
  a: number
  b: number
  f?: number
  className?: string
  style?: CSSProperties
  children?: ReactNode
}) {
  return (
    <div className={`shot ${className}`} style={{ ...vars({ '--a': a, '--b': b, '--f': f }), ...style }}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// StepScene: the recurring "copy on the left, a phone that plays through
// screens on the right" sequence. With reduced motion it becomes a plain list
// of rows, one per step, so nothing depends on scrolling.
// ---------------------------------------------------------------------------

export interface StepDef {
  key: string
  /** Small label above the title, e.g. the running time of the step. */
  time: string
  title: ReactNode
  body: string
  aside: string
  screen: ReactNode
  /** Variables applied to this step's screen layer (e.g. `--s`, `--cd`). */
  screenVars?: Record<string, string | number>
}

export function StepScene({
  steps,
  length = 100,
  tone = 'ink',
  label,
  chapter,
  kicker,
  className = '',
}: {
  steps: StepDef[]
  length?: number
  tone?: 'ink' | 'paper'
  label: string
  chapter: string
  kicker: ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()
  const n = steps.length

  if (reduced) {
    return (
      <section data-tone={tone} data-chapter={chapter} aria-label={label} className={`stepscene-static ${className}`}>
        <div className="wrap">
          <div className="stepscene-kicker">{kicker}</div>
          {steps.map((s, i) => (
            <article key={s.key} className="stepscene-row">
              <div>
                <p className="step-time">
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  {s.time}
                </p>
                <h2 className="display step-title">{s.title}</h2>
                <p className="step-body">{s.body}</p>
                <span className="tag">{s.aside}</span>
              </div>
              <Phone width="min(300px, 80vw)" style={vars({ '--s': 1, '--cd': 0.3, ...s.screenVars })}>
                {s.screen}
              </Phone>
            </article>
          ))}
        </div>
      </section>
    )
  }

  return (
    <Scene steps={n} length={length} tone={tone} className={`stepscene ${className}`} label={label} chapter={chapter}>
      <div className="wrap stepscene-grid">
        <div className="stepscene-left">
          <div className="stepscene-kicker">{kicker}</div>
          <ol className="stepscene-rail" aria-hidden="true">
            {steps.map((s, i) => (
              <li key={s.key} className="stepscene-node" style={vars({ '--i': i, '--n': n })}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                {s.key}
              </li>
            ))}
          </ol>
          <div className="stepscene-copy">
            {steps.map((s, i) => (
              <Shot key={s.key} a={i / n - (i === 0 ? 1 : 0)} b={(i + 1) / n + (i === n - 1 ? 1 : 0)} f={0.035} className="stepscene-panel">
                <p className="step-time">
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  {s.time}
                </p>
                <h2 className="display step-title">{s.title}</h2>
                <p className="step-body">{s.body}</p>
                <span className="tag">{s.aside}</span>
              </Shot>
            ))}
          </div>
        </div>
        <div className="stepscene-right">
          <Phone width="var(--stage-phone)" className="stepscene-phone">
            {steps.map((s, i) => (
              <Shot
                key={s.key}
                a={i / n - (i === 0 ? 1 : 0)}
                b={(i + 1) / n + (i === n - 1 ? 1 : 0)}
                f={0.03}
                className="stepscene-screen"
                style={vars({
                  '--k': `clamp(0, calc((var(--p) - ${(i / n).toFixed(4)}) / ${(1 / n).toFixed(4)}), 1)`,
                  ...s.screenVars,
                })}
              >
                {s.screen}
              </Shot>
            ))}
          </Phone>
        </div>
      </div>
    </Scene>
  )
}

// ---------------------------------------------------------------------------
// HRail: vertical scroll drives a horizontal track. The wrapper is exactly as
// tall as the distance the track has to travel, so scroll and motion stay 1:1.
// ---------------------------------------------------------------------------

export function HRail({
  tone = 'ink',
  className = '',
  id,
  label,
  chapter,
  header,
  children,
}: {
  tone?: 'ink' | 'paper'
  className?: string
  id?: string
  label?: string
  chapter?: string
  header?: ReactNode
  children: ReactNode
}) {
  const scene = useScrub<HTMLElement>({ mode: 'pin' })
  const track = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scene.current
    const tr = track.current
    if (!el || !tr) return
    const measureTravel = () => {
      const travel = Math.max(0, tr.scrollWidth - tr.parentElement!.clientWidth)
      el.style.setProperty('--travel', String(Math.round(travel)))
    }
    measureTravel()
    const ro = new ResizeObserver(measureTravel)
    ro.observe(tr)
    ro.observe(tr.parentElement!)

    // Children marked `data-focus` get `--f` (0..1): 1 when centred, falling off towards the edges.
    const items = Array.from(tr.querySelectorAll<HTMLElement>('[data-focus]'))
    const unsub = subscribeScroll((vh) => {
      const mid = window.innerWidth / 2
      const reach = Math.max(420, window.innerWidth * 0.55)
      for (const el of items) {
        const r = el.getBoundingClientRect()
        if (r.bottom < 0 || r.top > vh) continue
        const f = Math.max(0, 1 - Math.abs(r.left + r.width / 2 - mid) / reach)
        el.style.setProperty('--f', f.toFixed(3))
      }
    })
    return () => {
      ro.disconnect()
      unsub()
    }
  }, [scene])

  return (
    <section ref={scene} id={id} aria-label={label} data-tone={tone} data-chapter={chapter} className={`scene hrail ${className}`}>
      <div className="scene-stage hrail-stage">
        {header}
        <div className="hrail-viewport">
          <div ref={track} className="hrail-track">
            {children}
          </div>
        </div>
        <div className="hrail-meter" aria-hidden="true">
          <span />
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Marquee: text that slides with the scroll position instead of with time, so
// it speeds up, slows down and reverses exactly as the reader does.
// ---------------------------------------------------------------------------

export function Marquee({ items, className = '', speed = 0.45 }: { items: string[]; className?: string; speed?: number }) {
  const track = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tr = track.current
    const one = first.current
    if (!tr || !one) return
    if (prefersReducedMotion()) return
    return subscribeScroll(() => {
      const w = one.offsetWidth
      if (!w) return
      const x = -((window.scrollY * speed) % w)
      tr.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`
    })
  }, [speed])

  const row = (hidden: boolean, ref?: React.Ref<HTMLDivElement>) => (
    <div className="marquee-row" ref={ref} aria-hidden={hidden || undefined}>
      {items.map((item, i) => (
        <span key={i} className="marquee-item">
          {item}
        </span>
      ))}
    </div>
  )

  return (
    <div className={`marquee ${className}`} role="presentation">
      <div className="marquee-track" ref={track}>
        {row(false, first)}
        {row(true)}
        {row(true)}
      </div>
    </div>
  )
}
