/** The page is a film: every 70 px of scrolling is one second of running time, at 24 frames a second. */
export const PX_PER_SECOND = 70
export const FPS = 24

const pad = (n: number) => String(n).padStart(2, '0')

/** Scroll offset in pixels to a `MM:SS:FF` timecode. */
export function timecode(scrollY: number) {
  const s = Math.max(0, scrollY) / PX_PER_SECOND
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const f = Math.floor((s % 1) * FPS)
  return `${pad(m)}:${pad(sec)}:${pad(f)}`
}

/** The film's own clock, in seconds, to the same `MM:SS:FF` form. */
export function filmClock(seconds: number) {
  const s = Math.max(0, seconds)
  return `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}:${pad(Math.floor((s % 1) * FPS))}`
}
