// isOverdue — the one definition of "this task is still owed".
//
// PURE TypeScript: no React, no DB, no store, no clock (`today` is injected, like
// every other engine module). Extracted because four callers had written the same
// three-clause predicate by hand — the store's per-goal reschedule, the Goal Detail
// nudge, the weekly review, and the roadmap digest — and a rule this load-bearing
// must not be able to drift between them.
//
// OVERDUE = dated, scheduled STRICTLY BEFORE today, and not completed. Today is
// deliberately excluded: an open task scheduled for today isn't missed yet, the day
// is still in progress. Undated backlog rows are never overdue (they were never
// promised to a day — see partitionTasks). Both values are date-only 'YYYY-MM-DD',
// which compares lexicographically as calendar order.

import type { Task } from '@/core/types'
import type { ISODate } from '@/core/types'

// The fields the rule actually reads — so callers can pass a Task or any lighter
// projection of one, and the engine stays decoupled from the full entity.
export type OverdueCandidate = Pick<Task, 'scheduledDate' | 'status'>

export function isOverdue(task: OverdueCandidate, today: ISODate): boolean {
  return (
    task.scheduledDate !== undefined &&
    task.scheduledDate < today &&
    task.status !== 'completed'
  )
}
