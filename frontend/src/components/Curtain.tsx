import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { prefersReducedMotion } from '../lib/scrub'

/**
 * Route changes are a curtain call: a pair of drapes closes, the next reel's
 * title card is held for a beat, and they open on the new page. The first visit
 * of a session opens the same curtain on the site.
 */

const TITLES: Record<string, [string, string]> = {
  '/': ['Cadence', 'Make room for a second thought'],
  '/how-it-works': ['Reel I', 'How it works'],
  '/threats': ['Reel II', 'The threat'],
  '/playbook': ['Reel III', 'The playbook'],
  '/privacy': ['Reel IV', 'Privacy and limits'],
  '/help': ['Reel V', 'Help'],
  '/assistant': ['The booth', 'Voice assistant'],
}
const titleFor = (to: string): [string, string] => TITLES[to.split('#')[0]] ?? ['Cadence', 'One moment']

function introEligible() {
  try {
    if (navigator.webdriver || prefersReducedMotion()) return false
    if (sessionStorage.getItem('cadence.intro')) return false
    sessionStorage.setItem('cadence.intro', '1')
    return true
  } catch {
    return false
  }
}
const INTRO = introEligible()

const CurtainContext = createContext<{ go: (to: string) => void }>({ go: () => {} })
export const useCurtain = () => useContext(CurtainContext)

export function CurtainProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [state, setState] = useState<'open' | 'closed'>(INTRO ? 'closed' : 'open')
  const [label, setLabel] = useState<[string, string]>(TITLES['/'])
  const busy = useRef(false)

  // First visit: hold the title, then open.
  useEffect(() => {
    if (!INTRO) return
    const id = window.setTimeout(() => setState('open'), 1300)
    return () => window.clearTimeout(id)
  }, [])

  const go = useCallback(
    (to: string) => {
      if (busy.current) return
      const [path, hash] = to.split('#')
      const samePage = path === window.location.pathname
      if (prefersReducedMotion() || (samePage && hash)) {
        navigate(to)
        return
      }
      if (samePage) {
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      busy.current = true
      setLabel(titleFor(to))
      setState('closed')
      window.setTimeout(() => {
        flushSync(() => navigate(to))
        window.setTimeout(() => {
          setState('open')
          window.setTimeout(() => {
            busy.current = false
          }, 900)
        }, 700)
      }, 900)
    },
    [navigate],
  )

  return (
    <CurtainContext.Provider value={{ go }}>
      {children}
      <div className="curtain" data-state={state} aria-hidden="true">
        <div className="curtain-panel curtain-l" />
        <div className="curtain-panel curtain-r" />
        <div className="curtain-title">
          <small>{label[0]}</small>
          <strong>{label[1]}</strong>
        </div>
      </div>
    </CurtainContext.Provider>
  )
}
