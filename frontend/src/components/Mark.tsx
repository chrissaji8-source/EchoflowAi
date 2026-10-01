/** Cadence mark: four voice bars. The last is full height; the rest recede. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mark">
      <rect x="2.5" y="9" width="3.2" height="6" fill="currentColor" opacity="0.55" />
      <rect x="7.8" y="4.5" width="3.2" height="15" fill="currentColor" opacity="0.75" />
      <rect x="13.1" y="7" width="3.2" height="10" fill="currentColor" opacity="0.55" />
      <rect x="18.4" y="2.5" width="3.2" height="19" fill="currentColor" />
    </svg>
  )
}
