import { describe, expect, it } from 'vitest'
import { filmClock, FPS, PX_PER_SECOND, timecode } from './timecode'

describe('timecode', () => {
  it('starts at zero and never goes negative', () => {
    expect(timecode(0)).toBe('00:00:00')
    expect(timecode(-300)).toBe('00:00:00')
  })

  it('counts one second for every PX_PER_SECOND of scrolling', () => {
    expect(timecode(PX_PER_SECOND)).toBe('00:01:00')
    expect(timecode(PX_PER_SECOND * 75)).toBe('01:15:00')
  })

  it('counts frames inside a second', () => {
    expect(timecode(PX_PER_SECOND * 0.5)).toBe(`00:00:${String(FPS / 2).padStart(2, '0')}`)
  })
})

describe('filmClock', () => {
  it('formats the film playhead the same way', () => {
    expect(filmClock(0)).toBe('00:00:00')
    expect(filmClock(2.6)).toBe('00:02:14')
    expect(filmClock(76.5)).toBe('01:16:12')
  })
})
