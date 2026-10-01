import type { CSSProperties } from 'react'

const envelope = (i: number, n: number) => {
  const u = (i + 0.5) / n
  return 0.22 + 0.78 * Math.abs(Math.sin(u * 17) * Math.cos(u * 6.3 + 0.8))
}

/**
 * A small, self-playing picture of the assistant's two sound tracks: YOU above,
 * CADENCE below, taking turns. Pure CSS, decorative.
 */
export function VoiceTracks({ bars = 72 }: { bars?: number }) {
  const row = (who: 'you' | 'ai', label: string) => (
    <div className={`vtrack vtrack--${who}`}>
      <span className="vtrack-name">{label}</span>
      {Array.from({ length: bars }, (_, i) => (
        <i key={i} style={{ '--i': i, '--e': envelope(i + (who === 'ai' ? 11 : 0), bars).toFixed(3) } as CSSProperties} />
      ))}
    </div>
  )
  return (
    <div className="vtracks" aria-hidden="true">
      {row('you', 'You')}
      {row('ai', 'Cadence')}
      <span className="vtracks-head" />
    </div>
  )
}
