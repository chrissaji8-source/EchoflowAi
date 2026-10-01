import type { ReactNode } from 'react'
import { ArrowDown, ArrowUpRight } from 'lucide-react'
import { Reveal } from './motion'
import { TLink } from './Nav'
import { useScrub } from '../lib/scrub'

/**
 * Section label in the language of film credits: the name on the left, an index
 * on the right, a hairline above. No bullets, dots or dashes.
 */
export function Slate({ index, className = '', children }: { index?: string; className?: string; children: ReactNode }) {
  return (
    <p className={`slate ${className}`}>
      <span>{children}</span>
      {index && <span className="slate-index">{index}</span>}
    </p>
  )
}

/**
 * Academy-leader graphic: a ringed crosshair with a sweeping clock wipe and the
 * reel number counted in the middle. Purely decorative.
 */
function Leader({ num }: { num: string }) {
  return (
    <div className="leader" aria-hidden="true">
      <div className="leader-sweep" />
      <svg viewBox="0 0 400 400" className="leader-svg">
        <circle cx="200" cy="200" r="196" />
        <circle cx="200" cy="200" r="150" />
        <line x1="0" y1="200" x2="400" y2="200" />
        <line x1="200" y1="0" x2="200" y2="400" />
      </svg>
      <span className={`leader-num${num.length > 2 ? ' leader-num--wide' : ''}`}>{num}</span>
    </div>
  )
}

/**
 * Top-of-page title card. The headline pushes in and softens as you scroll past,
 * and the leader wheel turns behind it.
 */
export function PageHero({
  reel,
  name,
  num,
  title,
  lead,
  actions,
  aside,
}: {
  reel: string
  name: string
  num: string
  title: ReactNode
  lead: string
  actions?: ReactNode
  aside?: ReactNode
}) {
  const ref = useScrub<HTMLElement>({ mode: 'out' })
  return (
    <section ref={ref} className="page-hero" data-tone="ink" data-chapter="Title card">
      <Leader num={num} />
      <div className="wrap page-hero-grid">
        <div className="page-hero-copy">
          <Slate index={name}>{reel}</Slate>
          <h1 className="display page-hero-title">{title}</h1>
          <p className="lead">{lead}</p>
          {actions && <div className="page-hero-actions">{actions}</div>}
        </div>
        {aside && <div className="page-hero-aside">{aside}</div>}
      </div>
      <div className="scroll-cue" aria-hidden="true">
        <span>Scroll to play</span>
        <ArrowDown size={16} />
      </div>
    </section>
  )
}

/** "Coming next": a closing band that points at the following reel. */
export function CtaBand({
  tone = 'paper',
  title,
  body,
  to,
  label,
  next = 'Next reel',
}: {
  tone?: 'ink' | 'paper'
  title: ReactNode
  body: string
  to: string
  label: string
  next?: string
}) {
  return (
    <section className="cta-band" data-tone={tone} data-chapter="Next reel">
      <div className="wrap">
        <Slate index={label}>{next}</Slate>
        <div className="cta-band-inner">
          <Reveal>
            <h2 className="display cta-title">{title}</h2>
          </Reveal>
          <Reveal delay={120} className="cta-side">
            <p>{body}</p>
            <TLink to={to} className="btn btn--solid">
              {label} <ArrowUpRight size={17} aria-hidden="true" />
            </TLink>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/** Section heading used inside pages. */
export function SectionHead({
  index,
  label,
  title,
  lead,
  className = '',
}: {
  index?: string
  label: string
  title: ReactNode
  lead?: string
  className?: string
}) {
  return (
    <Reveal className={`section-head ${className}`}>
      <Slate index={index}>{label}</Slate>
      <h2 className="display section-title">{title}</h2>
      {lead && <p className="lead">{lead}</p>}
    </Reveal>
  )
}
