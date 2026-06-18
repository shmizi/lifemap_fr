// computeSubgoalProgress — task-completion momentum for a single subgoal
// (Phase 2).
//
// PURE TypeScript: no React, no DB, no store. Given every task under a subgoal
// (its loose tasks plus all of its milestones' tasks), it reports how many are
// done as { completed, total, percent }. The store derives this from the goal
// tree it already holds, so each subgoal in the Detail View can show its own
// progress ring.
//
// Like computeGoalProgress, this stays a separate named function rather than a
// shared generic: the codebase deliberately favors explicit per-domain functions
// over premature abstraction. (If these completion helpers ever need to change
// shape together, that's the moment to unify them — see the note in the handoff.)

import type { Task } from '@/core/types'

export interface SubgoalProgress {
  completed: number
  total: number
  // 0–100, rounded to a whole number. 0 when the subgoal has no tasks.
  percent: number
}

export function computeSubgoalProgress(tasks: Task[]): SubgoalProgress {
  const total = tasks.length
  const completed = tasks.filter((t) => t.status === 'completed').length

  // Guard total === 0 so a subgoal with no tasks reads as 0% rather than
  // dividing by zero (NaN).
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100)

  return { completed, total, percent }
}
