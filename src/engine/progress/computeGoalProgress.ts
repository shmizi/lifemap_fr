// computeGoalProgress — task-completion momentum for a whole goal (Phase 2).
//
// PURE TypeScript: no React, no DB, no store. Given every task under a goal
// (across all its subgoals/milestones), it reports how many are done as
// { completed, total, percent }. The store calls this so the math lives here,
// once, and a GoalCard's progress ring just renders the result.
//
// WHY this is its own function rather than a shared generic with
// computeTodayProgress: the two answer different questions (a goal's whole-life
// progress vs. one day's scheduled tasks) and the codebase deliberately avoids
// premature "reusable" abstractions. Keeping them as separate named domain
// functions is cheaper to read than one over-parameterized helper.

import type { Task } from '@/core/types'

export interface GoalProgress {
  completed: number
  total: number
  // 0–100, rounded to a whole number. 0 when the goal has no tasks (see guard).
  percent: number
}

export function computeGoalProgress(tasks: Task[]): GoalProgress {
  const total = tasks.length
  const completed = tasks.filter((t) => t.status === 'completed').length

  // Guard total === 0 so a goal with no tasks reads as 0% rather than dividing
  // by zero (NaN). Nothing to show progress on means 0 is the honest value.
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100)

  return { completed, total, percent }
}
