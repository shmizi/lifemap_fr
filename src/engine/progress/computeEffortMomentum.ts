// computeEffortMomentum — effort-weighted momentum for today (Phase 2).
//
// PURE TypeScript: no React, no DB, no store. Given today's scheduled tasks, it
// answers "how much WORK did I do today" rather than "how many tasks did I check
// off": it sums each task's effort weight (EFFORT_WEIGHTS) for the total
// ("planned effort today") and for completed-only ("completed effort today").
//
// This is intentionally NOT computeCompletion (or its today/goal/subgoal
// aliases): those count tasks 1-each. We only reuse the Completion SHAPE
// ({completed, total, percent}) so the dashboard wiring is unchanged — the
// numbers now mean effort units, not task counts.
//
// A task with no effort set is weighted as DEFAULT_EFFORT_WEIGHT (medium) rather
// than skipped, so quick-add / legacy tasks still contribute and don't distort
// the percentage.

import type { Task } from '@/core/types'
import { EFFORT_WEIGHTS, DEFAULT_EFFORT_WEIGHT } from '@/core/constants'
import type { Completion } from './computeCompletion'

function effortWeight(task: Task): number {
  return task.effort ? EFFORT_WEIGHTS[task.effort] : DEFAULT_EFFORT_WEIGHT
}

export function computeEffortMomentum(tasks: Task[]): Completion {
  const total = tasks.reduce((sum, t) => sum + effortWeight(t), 0)
  const completed = tasks
    .filter((t) => t.status === 'completed')
    .reduce((sum, t) => sum + effortWeight(t), 0)

  // Guard total === 0 (nothing scheduled) so the day reads as 0%, not NaN —
  // same contract as computeCompletion.
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100)

  return { completed, total, percent }
}
