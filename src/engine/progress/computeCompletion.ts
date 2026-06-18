// computeCompletion — the one task-completion primitive (Phase 2).
//
// PURE TypeScript: no React, no DB, no store. Given any set of tasks, it reports
// how many are completed as { completed, total, percent }. Every completion view
// in the app — a whole goal, a single subgoal — is the SAME math, so it lives
// here once. The domain-named wrappers (computeGoalProgress /
// computeSubgoalProgress) are thin aliases over this, kept so call sites read in
// their own terms.

import type { Task } from '@/core/types'

export interface Completion {
  completed: number
  total: number
  // 0–100, rounded to a whole number. 0 when there are no tasks (see guard).
  percent: number
}

export function computeCompletion(tasks: Task[]): Completion {
  const total = tasks.length
  const completed = tasks.filter((t) => t.status === 'completed').length

  // Guard total === 0 so an empty set reads as 0% rather than dividing by zero
  // (NaN). Nothing to show progress on means 0 is the honest value.
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100)

  return { completed, total, percent }
}
