// ProgressRing — a small, calm circular progress indicator.
//
// Pure presentation: given a precomputed percent (0–100), it draws a soft ring
// with the percent in the center. No store, no engine, no math — same contract
// as MomentumBar, but a ring reads better than a bar inside a compact card like
// GoalCard. The engine owns the percent; this only renders it.
//
// The ring eases its arc on each progress change to reinforce forward motion;
// reduced-motion users get the global override.

interface ProgressRingProps {
  percent: number // 0–100, precomputed by the engine
  size?: number // outer diameter in px
  strokeWidth?: number
  ariaLabel?: string
}

export function ProgressRing({
  percent,
  size = 40,
  strokeWidth = 4,
  ariaLabel,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  // Clamp so an out-of-range value can never draw a broken arc.
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  const dashOffset = circumference * (1 - clamped / 100)
  const allDone = clamped >= 100

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel ?? 'Progress'}
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-app-surface-alt"
        />
        {/* Fill — secondary (calm green) when complete, primary otherwise. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={`transition-[stroke-dashoffset] duration-500 ease-out ${
            allDone ? 'stroke-app-secondary' : 'stroke-app-primary'
          }`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-app-text-muted">
        {clamped}%
      </span>
    </div>
  )
}
