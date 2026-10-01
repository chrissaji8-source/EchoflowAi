import { useEffect, useRef, useState } from 'react'

/** True when the visitor asked the OS for less motion. Read at call time so it stays live. */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Reactive version of `prefersReducedMotion`, for components that render differently when motion is reduced. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

// ---------------------------------------------------------------------------
// One shared scroll loop. Every scrubbed element subscribes here instead of
// owning its own listener, so N scenes cost one scroll handler and one rAF.
// ---------------------------------------------------------------------------

type Subscriber = (viewportHeight: number) => void

const subscribers = new Set<Subscriber>()
let frame = 0
let bound = false

function run() {
  frame = 0
  const vh = window.innerHeight
  subscribers.forEach((fn) => fn(vh))
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(run)
}

export function subscribeScroll(fn: Subscriber) {
  subscribers.add(fn)
  if (!bound) {
    bound = true
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
  }
  schedule()
  return () => {
    subscribers.delete(fn)
    if (!subscribers.size && bound) {
      bound = false
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame)
      frame = 0
    }
  }
}

// ---------------------------------------------------------------------------
// useScrub: writes scroll progress to the element as the CSS variable `--p`
// (0 -> 1) and, optionally, the active step as `data-step`. No React state is
// touched while scrolling, so nothing re-renders.
//
//   mode 'pin'  - for tall "scene" wrappers holding a sticky stage. p is how far
//                 through the pinned distance you are.
//   mode 'view' - p is how far the element has travelled through the viewport
//                 (0 as it enters at the bottom, 1 as it leaves at the top).
//   mode 'out'  - for heroes at the top of a page: 0 at rest, 1 once scrolled
//                 fully past.
//   mode 'none' - do nothing; the element inherits `--p` from an ancestor scene.
// ---------------------------------------------------------------------------

export interface ScrubOptions {
  mode?: 'pin' | 'view' | 'out' | 'none'
  /** When set, `data-step` holds the active step index (0..steps-1). */
  steps?: number
}

/** Scroll progress (0..1) of an element, using the same definitions as `useScrub`. */
export function measure(el: HTMLElement, mode: 'pin' | 'view' | 'out', vh: number) {
  const rect = el.getBoundingClientRect()
  let p: number
  if (mode === 'pin') {
    const span = rect.height - vh
    p = span > 0 ? -rect.top / span : 0
  } else if (mode === 'out') {
    p = rect.height > 0 ? -rect.top / rect.height : 0
  } else {
    p = (vh - rect.top) / (vh + rect.height)
  }
  return Math.min(1, Math.max(0, p))
}

export function useScrub<T extends HTMLElement = HTMLDivElement>({ mode = 'pin', steps }: ScrubOptions = {}) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || mode === 'none') return
    const m = mode
    let lastP = -1
    let lastStep = -1

    // Phone screens (decorative, hidden from assistive tech) that are fully dissolved are
    // switched off, so the browser skips styling and painting them while out of the picture.
    // Text shots are never switched off: they must stay readable by screen readers.
    const shots =
      m === 'pin'
        ? Array.from(el.querySelectorAll<HTMLElement>('.shot'))
            .filter((node) => node.closest('[aria-hidden="true"]'))
            .map((node) => ({
              node,
              a: parseFloat(node.style.getPropertyValue('--a')),
              b: parseFloat(node.style.getPropertyValue('--b')),
              f: parseFloat(node.style.getPropertyValue('--f')) || 0.05,
              on: true,
            }))
        : []

    return subscribeScroll((vh) => {
      const p = measure(el, m, vh)

      for (const sh of shots) {
        const on = p > sh.a - sh.f * 1.2 && p < sh.b + sh.f * 1.2
        if (on !== sh.on) {
          sh.on = on
          sh.node.dataset.on = on ? 'true' : 'false'
        }
      }

      if (Math.abs(p - lastP) > 0.0002 || p === 0 || p === 1) {
        if (p !== lastP) el.style.setProperty('--p', p.toFixed(4))
        lastP = p
      }
      if (steps) {
        const step = Math.min(steps - 1, Math.floor(p * steps))
        if (step !== lastStep) {
          el.dataset.step = String(step)
          lastStep = step
        }
      }
    })
  }, [mode, steps])

  return ref
}

// ---------------------------------------------------------------------------
// useReveal: flips `data-in` once the element has entered the viewport.
// ---------------------------------------------------------------------------

export function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.18) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      el.dataset.in = ''
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            ;(entry.target as HTMLElement).dataset.in = ''
            io.unobserve(entry.target)
          }
        }
      },
      { threshold, rootMargin: '0px 0px -6% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])

  return ref
}

// ---------------------------------------------------------------------------
// useVideoScrub: the scroll position is the playhead. Maps a pinned scene's
// progress (between `from` and `to`) onto `video.currentTime`, eased so the
// picture glides instead of stepping. Needs a video encoded with frequent
// keyframes (the film is, see scripts/render-film.mjs).
// ---------------------------------------------------------------------------

export function useVideoScrub(
  video: React.RefObject<HTMLVideoElement | null>,
  scene: React.RefObject<HTMLElement | null>,
  from: number,
  to: number,
  /** Seconds into the film where scrubbing begins, so the screen opens on a picture rather than black. */
  startAt = 0,
) {
  useEffect(() => {
    const v = video.current
    const el = scene.current
    if (!v || !el || prefersReducedMotion()) return

    let target = 0
    let current = 0
    let raf = 0
    let running = false

    const loop = () => {
      current += (target - current) * 0.16
      if (Math.abs(target - current) < 0.0005) current = target
      const d = v.duration
      if (d && Number.isFinite(d)) {
        const want = Math.min(d - 0.05, startAt + current * (d - startAt))
        if (!v.seeking && Math.abs(v.currentTime - want) > 1 / 48) v.currentTime = want
      }
      if (current !== target) raf = requestAnimationFrame(loop)
      else running = false
    }

    const unsub = subscribeScroll((vh) => {
      const r = el.getBoundingClientRect()
      const span = r.height - vh
      const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0
      target = Math.min(1, Math.max(0, (p - from) / (to - from)))
      const near = r.top < vh && r.bottom > 0
      if (near && !running) {
        running = true
        raf = requestAnimationFrame(loop)
      }
    })
    return () => {
      unsub()
      cancelAnimationFrame(raf)
    }
  }, [video, scene, from, to, startAt])
}
