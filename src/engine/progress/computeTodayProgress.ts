// computeTodayProgress — the first sanctioned engine/ function (Phase 2).
//
// PURE TypeScript: no React, no DB, no store. Given the tasks scheduled for a
// day, it reports how many are done as { completed, total, percent }. The store
// calls this so the momentum math lives here, once, and never inline in a
// component or the store. UI reads the result; it never recomputes it.

import type { Task } from '@/core/types'

export interface TodayProgress {
  completed: number
  total: number
  // 0–100, rounded to a whole number. 0 when there are no tasks (see guard).
  percent: number
}

export function computeTodayProgress(tasks: Task[]): TodayProgress {
  const total = tasks.length
  const completed = tasks.filter((t) => t.status === 'completed').length

  // Guard total === 0 so an empty day reads as 0% rather than dividing by zero
  // (NaN). An empty day has nothing to show progress on, so 0 is the honest value.
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100)

  return { completed, total, percent }
}
