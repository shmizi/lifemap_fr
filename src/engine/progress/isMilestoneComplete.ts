// isMilestoneComplete — the milestone auto-completion rule (Phase 2).
//
// PURE TypeScript: no React, no DB, no store. The spec'd rule is "a milestone
// completes when ALL its tasks are completed, and re-opens if one is un-done."
// This predicate is the single source of truth for that decision; the store
// calls it after a task toggle and reconciles the milestone's status.
//
// A milestone with NO tasks is NOT complete: there is nothing to finish, so it
// must not silently flip to completed (and an empty `every` is vacuously true,
// which is exactly the trap this guard avoids).

import type { Task } from '@/core/types'

export function isMilestoneComplete(tasks: Task[]): boolean {
  if (tasks.length === 0) return false
  return tasks.every((t) => t.status === 'completed')
}
