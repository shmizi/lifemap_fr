// rankTasks — pick the few most worth-doing tasks across all goals (Phase 2).
//
// PURE TypeScript: no React, no DB, no store. Given every task (across all
// goals), it drops the ones that are done or abandoned, scores the rest with
// scoreTask, sorts by score, and returns the top N (default 3).
//
// This ranks the WHOLE incomplete backlog, NOT just today's scheduled tasks —
// that is the point of the feature. The dashboard's Today list answers "what did
// I plan for today"; this answers "what most deserves attention right now,
// scheduled or not". They are two lenses on the same task data.

import type { Task } from '@/core/types'
import { scoreTask } from './scoreTask'

export const DEFAULT_TOP_N = 3

// A task is a ranking candidate while it is still open. Completed tasks are done;
// skipped tasks are deliberately set aside — neither belongs on a focus list.
function isOpen(task: Task): boolean {
  return task.status !== 'completed' && task.status !== 'skipped'
}

export function rankTasks(
  tasks: Task[],
  now: Date,
  topN: number = DEFAULT_TOP_N,
): Task[] {
  return tasks
    .filter(isOpen)
    .map((task) => ({ task, score: scoreTask(task, now) }))
    // Highest score first. Tie-break by createdAt (older first) so the order is
    // deterministic and a long-waiting task edges out a brand-new one.
    .sort(
      (a, b) =>
        b.score - a.score || a.task.createdAt.localeCompare(b.task.createdAt),
    )
    .slice(0, Math.max(0, topN))
    .map((entry) => entry.task)
}
