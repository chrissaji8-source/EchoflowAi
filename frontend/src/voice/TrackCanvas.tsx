import { useEffect, useRef, type RefObject } from 'react'
import { prefersReducedMotion } from '../lib/scrub'
import type { VoiceLevels } from './session'
import type { VoicePhase } from './types'

/**
 * The conversation as two sound tracks, the way a film's dialogue is laid out on
 * an editing table. The upper track is YOU, the lower is CADENCE. Loudness is
 * recorded at the playhead and scrolls away to the left as time passes, so
 * whoever is talking is obvious at a glance, and so is what was said a moment ago.
 *
 * Only greys are used. The track that is speaking is drawn bright, the other dim.
 */

const PITCH = 5 // css px between samples
const BAR = 2 // css px width of one sample
const PLAY = 0.86 // where the playhead sits, as a fraction of the width
const RATE = 38 // samples per second

const resample = (old: Float32Array, len: number) => {
  const next = new Float32Array(len)
  const keep = Math.min(len, old.length)
  next.set(old.subarray(old.length - keep), len - keep)
  return next
}

export function TrackCanvas({
  phase,
  muted,
  levels,
}: {
  phase: VoicePhase
  muted: boolean
  levels: RefObject<VoiceLevels>
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef(phase)
  const mutedRef = useRef(muted)

  useEffect(() => {
    phaseRef.current = phase
    mutedRef.current = muted
  }, [phase, muted])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reduced = prefersReducedMotion()
    let w = 0
    let h = 0
    let fg = '#f2f2f2'
    let you = new Float32Array(0)
    let ai = new Float32Array(0)
    let youNow = 0
    let aiNow = 0
    let k = 0
    let acc = 0
    let last = performance.now()
    let fade = 0 // 0 = live, 1 = dimmed (ended or failed)
    let raf = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = rect.width
      h = rect.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      fg = getComputedStyle(canvas).color
      const len = Math.max(8, Math.ceil((w * PLAY) / PITCH) + 2)
      you = resample(you, len)
      ai = resample(ai, len)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const sample = (now: number) => {
      const p = phaseRef.current
      const lv = levels.current ?? { input: 0, output: 0 }
      const isMuted = mutedRef.current
      const t = reduced ? 0 : now / 1000
      k++
      const n = 0.55 + 0.45 * Math.abs(Math.sin(t * 9.1 + k * 1.7) * Math.cos(t * 4.3 + k * 0.9))
      let y = 0.01
      let a = 0.01
      switch (p) {
        case 'speaking':
          a = lv.output * n
          break
        case 'user-speaking':
          y = isMuted ? 0.01 : lv.input * n
          break
        case 'listening':
          y = isMuted ? 0.006 : 0.028 + lv.input * n * 0.9
          break
        case 'connecting':
        case 'requesting-mic':
        case 'reconnecting':
          y = 0.04 + 0.06 * (0.5 + 0.5 * Math.sin(t * 5))
          a = 0.04 + 0.06 * (0.5 + 0.5 * Math.sin(t * 5 + Math.PI))
          break
        case 'idle':
          y = 0.02 + 0.012 * Math.sin(t * 1.6)
          a = 0.02 + 0.012 * Math.sin(t * 1.6 + 1)
          break
        default:
          break
      }
      youNow += (y - youNow) * (y > youNow ? 0.6 : 0.3)
      aiNow += (a - aiNow) * (a > aiNow ? 0.6 : 0.3)
      you.copyWithin(0, 1)
      ai.copyWithin(0, 1)
      you[you.length - 1] = youNow
      ai[ai.length - 1] = aiNow
    }

    const lane = (buf: Float32Array, cy: number, laneH: number, bright: boolean, dashed: boolean, playX: number) => {
      // The track itself: a hairline up to the playhead, open film after it.
      ctx.globalAlpha = 0.28
      if (dashed) {
        ctx.setLineDash([6, 6])
        ctx.lineWidth = 1
        ctx.strokeStyle = fg
        ctx.beginPath()
        ctx.moveTo(0, Math.round(cy) + 0.5)
        ctx.lineTo(playX, Math.round(cy) + 0.5)
        ctx.stroke()
        ctx.setLineDash([])
      } else {
        ctx.fillRect(0, Math.round(cy), playX, 1)
      }
      ctx.globalAlpha = 0.18
      for (let x = playX + PITCH; x < w; x += PITCH * 2) ctx.fillRect(x, Math.round(cy) - 1, 1, 3)

      if (dashed) return
      const len = buf.length
      for (let i = 0; i < len; i++) {
        const x = playX - (len - 1 - i) * PITCH
        if (x < -BAR) continue
        const f = i / len
        const half = Math.max(0.5, buf[i] * laneH * 0.5)
        ctx.globalAlpha = (bright ? 0.22 + 0.78 * Math.pow(f, 1.3) : 0.12 + 0.3 * f) * (1 - fade * 0.55)
        ctx.fillRect(x - BAR / 2, cy - half, BAR, half * 2)
      }
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (!w) return
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const p = phaseRef.current
      const isMuted = mutedRef.current

      acc += dt * (reduced ? 12 : RATE)
      while (acc >= 1) {
        acc -= 1
        sample(now)
      }
      fade += ((p === 'ended' || p === 'error' ? 1 : 0) - fade) * 0.08

      const playX = Math.round(w * PLAY)
      const laneH = h * 0.4
      const cy1 = h * 0.25
      const cy2 = h * 0.75
      const speaker = p === 'speaking' ? 'ai' : p === 'user-speaking' || (p === 'listening' && !isMuted) ? 'you' : null

      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = fg
      ctx.strokeStyle = fg
      lane(you, cy1, laneH, speaker === 'you', isMuted && (p === 'listening' || p === 'user-speaking'), playX)
      lane(ai, cy2, laneH, speaker === 'ai', false, playX)

      // While Cadence works out a reply, a short bar travels along its track.
      const busy = p === 'thinking' || p === 'connecting' || p === 'requesting-mic' || p === 'reconnecting'
      if (busy && !reduced) {
        const s = ((now / 1000) * 0.55) % 1
        const x0 = s * (playX + 60) - 60
        for (let j = 0; j < 12; j++) {
          ctx.globalAlpha = 0.08 + (j / 12) * 0.92
          ctx.fillRect(x0 + j * 5, cy2 - 1.5, 5, 3)
        }
      }

      // The playhead.
      ctx.globalAlpha = 0.85 * (1 - fade * 0.5)
      ctx.fillRect(playX, 0, 1, h)
      ctx.beginPath()
      ctx.moveTo(playX - 6, 0)
      ctx.lineTo(playX + 7, 0)
      ctx.lineTo(playX + 0.5, 8)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = 1
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [levels])

  return <canvas ref={canvasRef} className="va-canvas" aria-hidden="true" />
}
