// MomentumBar — a calm "today's progress" indicator.
//
// Pure presentation: it takes already-computed numbers and draws a soft fill bar
// with an "n of m done" label. No store, no engine, no math (the engine owns the
// percent; the store holds it). Decoupled by design so it stays a reusable
// progress primitive — the dashboard passes the values in.
//
// Renders nothing when there is nothing scheduled: an empty 0-of-0 bar carries no
// momentum, and the Today list already shows its own empty state.

interface MomentumBarProps {
  completed: number
  total: number
  percent: number // 0–100, precomputed by the engine
}

export function MomentumBar({ completed, total, percent }: MomentumBarProps) {
  if (total === 0) return null

  const allDone = completed === total

  return (
    <div className="rounded-app-lg border border-app-border bg-app-surface p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-app-text">Today's progress</h2>
        <span className="text-sm text-app-text-muted">
          {completed} of {total} done
        </span>
      </div>

      {/* Track + soft fill. The fill eases its width on each progress change to
          reinforce forward motion; reduced-motion users get the global override. */}
      <div
        className="mt-4 h-2 w-full overflow-hidden rounded-full bg-app-surface-alt"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Today's task completion"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
            allDone ? 'bg-app-secondary' : 'bg-app-primary'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
