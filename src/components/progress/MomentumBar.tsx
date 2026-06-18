// MomentumBar — a calm "how much work did I do today" indicator.
//
// Pure presentation: it takes already-computed numbers and draws a soft fill bar
// led by the percentage. No store, no engine, no math (the engine owns the
// percent; the store holds it). Decoupled by design so it stays a reusable
// progress primitive — the dashboard passes the values in.
//
// IMPORTANT: completed/total are EFFORT UNITS (summed task-size weights), not a
// task count — so the copy leads with the percentage and frames the raw numbers
// as "effort points". Saying "3 of 5 done" here would mislead (it reads as
// tasks). The percentage is the honest headline; the points are a quiet detail.
//
// Renders nothing when nothing is scheduled (total 0): an empty bar carries no
// momentum, and the Today list already shows its own empty state.

interface MomentumBarProps {
  completed: number // effort units completed today
  total: number // effort units scheduled today
  percent: number // 0–100, precomputed by the engine
}

export function MomentumBar({ completed, total, percent }: MomentumBarProps) {
  if (total === 0) return null

  const allDone = completed === total

  return (
    <div className="rounded-app-lg border border-app-border bg-app-surface p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-app-text">Today's effort</h2>
        <span className="text-xl font-semibold text-app-text">{percent}%</span>
      </div>

      {/* Track + soft fill. The fill eases its width on each progress change to
          reinforce forward motion; reduced-motion users get the global override. */}
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-app-surface-alt"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Share of today's planned effort completed"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
            allDone ? 'bg-app-secondary' : 'bg-app-primary'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-app-text-muted">
        {allDone
          ? 'All of today’s planned effort done.'
          : `${completed} of ${total} effort points done today.`}
      </p>
    </div>
  )
}
