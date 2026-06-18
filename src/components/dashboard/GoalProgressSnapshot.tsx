// GoalProgressSnapshot — a compact, glance-able "where each goal stands" list
// for the dashboard.
//
// Pure presentation: it takes the goals and their precomputed per-goal progress
// and renders one calm row per active goal (title + a small ProgressRing). No
// store, no engine, no math — the dashboard selects the slices and passes them
// in. Reuses ProgressRing so the visual matches the Goal Detail header.
//
// The progress prop is typed minimally (just `percent`, keyed by goal id) so
// this UI component stays free of engine imports per the layering rule; the
// store's goalProgress entries (which also carry completed/total) satisfy this
// shape structurally.

import type { Goal, ID } from '@/core/types'
import { ProgressRing } from '@/components/progress/ProgressRing'

interface GoalProgressSnapshotProps {
  goals: Goal[]
  progressByGoalId: Record<ID, { percent: number }>
}

export function GoalProgressSnapshot({
  goals,
  progressByGoalId,
}: GoalProgressSnapshotProps) {
  // Only goals still being worked on belong in a forward-looking snapshot;
  // completed/archived ones would just add noise.
  const activeGoals = goals.filter(
    (g) => g.status !== 'completed' && g.status !== 'archived',
  )

  return (
    <section className="rounded-app-lg border border-app-border bg-app-surface p-6">
      <h2 className="text-lg font-semibold text-app-text">Goal progress</h2>
      <p className="mt-1 text-sm text-app-text-muted">
        Where each of your goals stands right now.
      </p>

      <div className="mt-4">
        {goals.length === 0 ? (
          <p className="text-sm text-app-text-muted">
            Create your first goal to see progress here.
          </p>
        ) : activeGoals.length === 0 ? (
          <p className="text-sm text-app-text-muted">
            No active goals right now.
          </p>
        ) : (
          <ul className="space-y-3">
            {activeGoals.map((goal) => (
              <li key={goal.id} className="flex items-center gap-3">
                <span className="flex-1 truncate text-sm text-app-text">
                  {goal.title}
                </span>
                <ProgressRing
                  percent={progressByGoalId[goal.id]?.percent ?? 0}
                  size={32}
                  ariaLabel={`${goal.title} progress`}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
