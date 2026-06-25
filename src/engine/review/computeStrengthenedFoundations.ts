// computeStrengthenedFoundations — the Weekly Review's dependency signal
// (Phase 4): which foundational subgoals did this week's completed work advance?
//
// PURE TypeScript: no React, no DB, no store.
//
// SCREEN PRINCIPLE: each LifeMap screen answers one question. The Weekly Review's
// is "why did this week's work matter?" — so the dependency graph appears here as
// leverage GAINED, not as a to-do (that is the Dashboard) or a map (the Roadmap).
// A subgoal counts as "strengthened" when the user completed a task under it
// during the window AND it supports at least one still-active subgoal: progress
// that lifts the work resting on it.
//
// SOFT model: an edge fromId -> toId means "fromId supports/strengthens toId."
// We reuse computeActiveSupportCounts (NOT a re-implementation) for the active
// out-degree per subgoal, so this stays the single source of that math.

import type { Dependency, ID, Task } from '@/core/types'
import { computeActiveSupportCounts } from '@/engine/priority/dependencyBoost'

export interface StrengthenedFoundation {
  subgoalId: ID
  // How many still-active subgoals this one supports (active out-degree). > 0 by
  // construction — a subgoal that lifts nothing active is not a "foundation" here.
  activeSupportCount: number
}

export function computeStrengthenedFoundations(
  // Tasks completed within the review window (from computeWeeklyReview).
  completedTasks: Task[],
  subgoalEdges: Dependency[],
  completedSubgoalIds: ReadonlySet<ID>,
): StrengthenedFoundation[] {
  // Active out-degree per subgoal — the same signal the dashboard shows.
  const activeCounts = computeActiveSupportCounts(
    subgoalEdges,
    completedSubgoalIds,
  )

  // Subgoals the user actually moved this week (had a task completed under them).
  const advancedSubgoalIds = new Set(completedTasks.map((t) => t.subgoalId))

  const result: StrengthenedFoundation[] = []
  for (const subgoalId of advancedSubgoalIds) {
    const activeSupportCount = activeCounts[subgoalId] ?? 0
    // Only foundations: progress on a subgoal that lifts still-active work.
    if (activeSupportCount > 0) {
      result.push({ subgoalId, activeSupportCount })
    }
  }

  // Most leverage first; subgoalId as a deterministic tie-break (the store
  // resolves titles afterwards, preserving this order).
  result.sort(
    (a, b) =>
      b.activeSupportCount - a.activeSupportCount ||
      a.subgoalId.localeCompare(b.subgoalId),
  )
  return result
}
