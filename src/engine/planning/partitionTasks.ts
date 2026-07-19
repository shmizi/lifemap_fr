// partitionTasks — split a set of tasks into the DATED plan and the undated
// BACKLOG (Phase 10, "living roadmap").
//
// PURE TypeScript: no React, no DB, no store, no clock. The Phase 10 insight is
// that not every task should carry a calendar date — forcing a date onto far-off
// work is what makes a plan feel rigid and fake. Only near-term concrete work is
// scheduled; the rest is undated "phase backlog" that should INFORM (it's visible)
// without NAGGING (it never lands on the dashboard's day-keyed lists — those query
// the scheduledDate index, which undated rows aren't in, so they're excluded for
// free). This helper reifies that split so the UI can render the two groups apart.
//
// BACKLOG = an OPEN task with no scheduledDate ("later, not scheduled yet").
// SCHEDULED = everything else: any dated task, plus completed tasks (a finished
// task belongs with the done work, not the someday pile — even if it never had a
// date). Order within each group is preserved.

import type { Task } from '@/core/types'

export interface PartitionedTasks {
  scheduled: Task[]
  backlog: Task[]
}

export function partitionScheduledAndBacklog(tasks: Task[]): PartitionedTasks {
  const scheduled: Task[] = []
  const backlog: Task[] = []
  for (const task of tasks) {
    if (task.scheduledDate === undefined && task.status !== 'completed') {
      backlog.push(task)
    } else {
      scheduled.push(task)
    }
  }
  return { scheduled, backlog }
}
