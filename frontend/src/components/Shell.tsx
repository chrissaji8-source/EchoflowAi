import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowUpRight, Menu, Mic, X } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import { Slate } from './bits'
import { Mark } from './Mark'
import { TLink, TNavLink, ScrollToTop } from './Nav'
import { timecode } from '../lib/timecode'
import { subscribeScroll } from '../lib/scrub'

export const PAGES = [
  { to: '/how-it-works', roman: 'I', label: 'How it works', blurb: 'Browser microphone capture, speech activity ducking, transcript rules, and estimated context recovery.', run: '4 min' },
  { to: '/threats', roman: 'II', label: 'Failure modes', blurb: 'Speech recognition, microphone echo, and playback timing limitations in the prototype.', run: '5 min' },
  { to: '/playbook', roman: 'III', label: 'Limits & diagnostics', blurb: 'Implementation settings and known limitations, without unverified benchmark claims.', run: '5 min' },
  { to: '/privacy', roman: 'IV', label: 'Architecture & data', blurb: 'What is sent to chat providers, how microphone processing works, and what stays in session memory.', run: '4 min' },
  { to: '/help', roman: 'V', label: 'Setup & help', blurb: 'Run the app, configure a model key, and troubleshoot microphone or connection issues.', run: '3 min' },
] as const

// ---------------------------------------------------------------------------
// Header: one solid bar. It slips away while you read down and returns the
// moment you scroll back up, so the picture gets the whole frame.
// ---------------------------------------------------------------------------

function Header() {
  const [open, setOpen] = useState(false)
  const bar = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    let last = window.scrollY
    return subscribeScroll(() => {
      const el = bar.current
      if (!el) return
      const y = window.scrollY
      const d = y - last
      if (y < 160) el.dataset.hidden = 'false'
      else if (d > 8) el.dataset.hidden = 'true'
      else if (d < -8) el.dataset.hidden = 'false'
      if (Math.abs(d) > 8) last = y
    })
  }, [])

  return (
    <header ref={bar} className="site-header" data-hidden="false">
      <div className="header-inner">
        <TLink to="/" className="wordmark" aria-label="EchoFlow, home">
          <Mark size={22} />
          <span>echoflow</span>
        </TLink>

        <nav className="header-nav" aria-label="Main">
          {PAGES.map((p) => (
            <TNavLink key={p.to} to={p.to} className="header-link">
              <em>{p.roman}</em>
              {p.label}
            </TNavLink>
          ))}
        </nav>

        <div className="header-right">
          <TLink to="/assistant" className="header-cta">
            <Mic size={15} aria-hidden="true" />
            <span>Launch Assistant</span>
          </TLink>

          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger className="menu-button" aria-label="Open menu">
              <Menu size={20} aria-hidden="true" />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="menu-overlay" />
              <Dialog.Content className="menu-sheet" aria-describedby={undefined}>
                <div className="menu-top">
                  <Dialog.Title className="menu-title">Menu</Dialog.Title>
                  <Dialog.Close className="menu-button" aria-label="Close menu">
                    <X size={20} aria-hidden="true" />
                  </Dialog.Close>
                </div>
                <nav className="menu-links" aria-label="Mobile">
                  <TNavLink to="/" end className="menu-link">
                    <span>0</span>Home
                  </TNavLink>
                  {PAGES.map((p) => (
                    <TNavLink key={p.to} to={p.to} className="menu-link">
                      <span>{p.roman}</span>
                      {p.label}
                    </TNavLink>
                  ))}
                </nav>
                <TLink to="/assistant" className="btn btn--solid menu-cta">
                  <Mic size={17} aria-hidden="true" /> Launch Assistant
                </TLink>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Timeline: the page is a film and the scrollbar is the playhead. A timecode
// counts as you read, the chapters are marked on the track, and you can drag
// (or use the arrow keys on) the track to scrub.
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

type Mark = { top: number; name: string }

function Timeline() {
  const { pathname } = useLocation()
  const hud = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const tc = useRef<HTMLSpanElement>(null)
  const chapter = useRef<HTMLSpanElement>(null)
  const marks = useRef<Mark[]>([])
  const [ticks, setTicks] = useState<{ f: number; name: string }[]>([])
  const dragging = useRef(false)

  // Find the chapters on the current page and place them on the track.
  useEffect(() => {
    const measureMarks = () => {
      const doc = document.documentElement
      const span = Math.max(1, doc.scrollHeight - window.innerHeight)
      const list: Mark[] = []
      document.querySelectorAll<HTMLElement>('[data-chapter]').forEach((el) => {
        const name = el.dataset.chapter
        if (!name) return
        list.push({ top: el.getBoundingClientRect().top + window.scrollY, name })
      })
      list.sort((a, b) => a.top - b.top)
      marks.current = list
      setTicks(list.slice(1).map((m) => ({ f: Math.min(1, m.top / span), name: m.name })))
      window.dispatchEvent(new Event('scroll'))
    }
    const ids = [0, 250, 900, 2200].map((ms) => window.setTimeout(measureMarks, ms))
    const ro = new ResizeObserver(measureMarks)
    ro.observe(document.body)
    window.addEventListener('resize', measureMarks)
    document.fonts?.ready.then(measureMarks)
    return () => {
      ids.forEach((id) => window.clearTimeout(id))
      ro.disconnect()
      window.removeEventListener('resize', measureMarks)
    }
  }, [pathname])

  useEffect(() => {
    let lastTc = ''
    let lastChapter = ''
    return subscribeScroll((vh) => {
      const doc = document.documentElement
      const y = window.scrollY
      const span = Math.max(1, doc.scrollHeight - vh)
      const p = Math.min(1, Math.max(0, y / span))
      // Scoped to the bar: a variable on <html> would restyle the whole page on every scroll frame.
      hud.current?.style.setProperty('--page-p', p.toFixed(4))
      const code = timecode(y)
      if (tc.current && code !== lastTc) {
        tc.current.textContent = code
        lastTc = code
      }
      const list = marks.current
      let idx = 0
      for (let i = 0; i < list.length; i++) if (list[i].top <= y + vh * 0.45) idx = i
      const label = list.length ? `${pad(idx + 1)} of ${pad(list.length)}  ${list[idx].name}` : ''
      if (chapter.current && label !== lastChapter) {
        chapter.current.textContent = label
        lastChapter = label
      }
      const pct = Math.round(p * 100)
      track.current?.setAttribute('aria-valuenow', String(pct))
      track.current?.setAttribute('aria-valuetext', list.length ? `${pct} percent, ${list[idx].name}` : `${pct} percent`)
    })
  }, [])

  const seek = (clientX: number) => {
    const el = track.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    const span = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: f * span, behavior: 'instant' })
  }

  return (
    <div ref={hud} className="hud" role="group" aria-label="Page timeline">
      <span className="hud-tc" aria-hidden="true">
        TC <span ref={tc}>00:00:00</span>
      </span>
      <div
        ref={track}
        className="hud-track"
        role="slider"
        tabIndex={0}
        aria-label="Scrub the page"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          seek(e.clientX)
        }}
        onPointerMove={(e) => dragging.current && seek(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={(e) => {
          const step = window.innerHeight * 0.4
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') window.scrollBy({ top: step, behavior: 'smooth' })
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') window.scrollBy({ top: -step, behavior: 'smooth' })
          else if (e.key === 'Home') window.scrollTo({ top: 0, behavior: 'smooth' })
          else if (e.key === 'End') window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
          else return
          e.preventDefault()
        }}
      >
        <span className="hud-rail" />
        <span className="hud-fill" />
        {ticks.map((t, i) => (
          <span key={`${t.name}-${i}`} className="hud-mark" style={{ left: `${(t.f * 100).toFixed(3)}%` }} />
        ))}
        <span className="hud-head" />
      </div>
      <span className="hud-reel" aria-hidden="true">
        <span ref={chapter} />
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Footer: the end credits.
// ---------------------------------------------------------------------------

const CREDITS = [
  ['Theme', 'Theme 8: Conversational Voice Assistant'],
  ['Problem Statement', 'Intercept Detection & Turn-Taking'],
  ['Challenge', 'CuriousParc 2026 • State Innovation Challenge'],
  ['Engine', 'EchoFlow FastAPI and browser prototype'],
]

function Footer() {
  return (
    <footer className="site-footer" data-tone="ink" data-chapter="Project Overview">
      <div className="wrap">
        <Slate index="CP2026">Project Overview</Slate>
        <div className="footer-grid">
          <div className="footer-lede">
            <p className="footer-tag">Natural conversations don’t wait for turns.</p>
            <TLink to="/assistant" className="btn btn--solid">
              <Mic size={17} aria-hidden="true" /> Launch Assistant <ArrowUpRight size={16} aria-hidden="true" />
            </TLink>
          </div>
          <nav className="footer-col" aria-label="Footer, reels">
            <h2>Sections</h2>
            {PAGES.map((p) => (
              <TLink key={p.to} to={p.to}>
                {p.label}
              </TLink>
            ))}
          </nav>
          <nav className="footer-col" aria-label="Footer, echoflow">
            <h2>EchoFlow AI</h2>
            <TLink to="/">Overview</TLink>
            <TLink to="/assistant">Voice Assistant</TLink>
            <TLink to="/hud">Telemetry HUD</TLink>
          </nav>
        </div>
        <dl className="credits">
          {CREDITS.map(([role, name]) => (
            <div key={role}>
              <dt>{role}</dt>
              <dd>{name}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="footer-word" aria-hidden="true">
        echoflow
      </div>
      <div className="wrap footer-fine">
        <span>CuriousParc 2026 • State Innovation Challenge • Theme 8: Conversational Voice Assistant</span>
        <span>© 2026 EchoFlow AI</span>
      </div>
    </footer>
  )
}

/** Layout for every marketing page. The assistant page has its own chrome. */
export function SiteLayout() {
  return (
    <>
      <ScrollToTop />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main" className="page">
        <Outlet />
      </main>
      <Footer />
      <Timeline />
    </>
  )
}
