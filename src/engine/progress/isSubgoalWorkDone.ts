// isSubgoalWorkDone — is every piece of work under a subgoal finished?
//
// PURE TypeScript: no React, no DB, no store.
//
// DELIBERATELY NOT AN AUTO-COMPLETION RULE, unlike isMilestoneComplete. A milestone
// is a fixed set of tasks, so "all tasks done" IS "milestone done" and the store can
// flip it automatically. A subgoal is not: a consistency subgoal carries a ROLLING
// plan that tops itself up (see topUpRoadmap), so it never runs out of tasks and
// would never auto-complete — while a subgoal whose current window happens to be
// ticked would auto-complete the moment the last task is checked, then silently
// re-open when the next batch lands. Both behaviours are wrong.
//
// So subgoal completion stays the USER's call, and this predicate only powers the
// nudge that asks them ("all the work here is done — mark it complete?"). That keeps
// the signal honest without the app flip-flopping a status the user is responsible
// for.
//
// Returns false when there is NO work at all: an empty subgoal has nothing finished,
// and an empty `every` is vacuously true — the same trap isMilestoneComplete guards.

import type { SubgoalTree } from '@/core/types'

export function isSubgoalWorkDone(tree: SubgoalTree): boolean {
  const tasks = [
    ...tree.looseTasks,
    ...tree.milestones.flatMap((m) => m.tasks),
  ]
  // A subgoal that holds only empty phases has nothing done either — the phases
  // are still unplanned work, not finished work.
  if (tasks.length === 0) return false
  if (!tasks.every((t) => t.status === 'completed')) return false
  // Every phase must also read as done. A phase can be marked complete with no
  // tasks (the user planned it away), so this is checked separately rather than
  // inferred from the task list.
  return tree.milestones.every((m) => m.milestone.status === 'completed')
}
