// dependencyBoost — the soft dependency signal's contribution to task priority
// (Phase 3).
//
// PURE TypeScript: no React, no DB, no store. Given the subgoal dependency edges
// and which subgoals are already complete, it answers "how many still-useful
// subgoals does each subgoal support?" (its ACTIVE out-degree) and turns that
// into a small, bounded score nudge.
//
// WHY a separate function (not folded into scoreTask): scoreTask reads only a
// task's INTRINSIC signals (priority, due date, schedule). The dependency boost
// is EXTRINSIC — it comes from the subgoal graph, not the task — so per the
// Phase 2 rule ("diverging semantics get their own function") it lives here and
// is added on top by rankTasks.
//
// SOFT model: an edge fromId -> toId means "fromId supports/strengthens toId."
// The supporter (fromId) is the foundational one, so ITS tasks get the nudge.
// The nudge is deliberately tiny (see the cap) — a tie-breaker among comparable
// tasks, never enough to overtake real urgency or a higher intrinsic priority.

import type { Dependency, ID } from '@/core/types'

// Per active supported-subgoal. Kept well below a single priority step (10 in
// scoreTask) so the boost reorders genuine ties without burying urgency.
export const DEPENDENCY_BOOST_PER_ACTIVE_SUPPORT = 2

// Hard ceiling: supporting 3+ active subgoals stops adding score. Caps the
// signal at +6, still under one priority tier — intentionally a nudge, not a lever.
export const MAX_DEPENDENCY_BOOST = 6

/**
 * Active out-degree per supporter subgoal: for each subgoal `fromId`, how many
 * DISTINCT-edge supported subgoals (`toId`) are NOT yet complete. An edge whose
 * supported subgoal is already done contributes nothing — strengthening a
 * finished subgoal has no remaining value (the user's rule).
 *
 * Keyed by the SUPPORTER's subgoalId. Subgoals that support nothing active are
 * simply absent from the result (treated as 0 by callers).
 *
 * `subgoalEdges` is expected to be the subgoal-type graph (the caller fetches it
 * by type); the function does not re-filter by `type`.
 */
export function computeActiveSupportCounts(
  subgoalEdges: Dependency[],
  completedSubgoalIds: ReadonlySet<ID>,
): Record<ID, number> {
  const counts: Record<ID, number> = {}
  for (const edge of subgoalEdges) {
    // The supported subgoal is done -> this edge no longer contributes.
    if (completedSubgoalIds.has(edge.toId)) continue
    counts[edge.fromId] = (counts[edge.fromId] ?? 0) + 1
  }
  return counts
}

/**
 * Turn an active-support count into a bounded score nudge. 0 for no support;
 * otherwise linear in the count up to MAX_DEPENDENCY_BOOST.
 */
export function dependencyBoost(activeSupportCount: number): number {
  if (activeSupportCount <= 0) return 0
  return Math.min(
    activeSupportCount * DEPENDENCY_BOOST_PER_ACTIVE_SUPPORT,
    MAX_DEPENDENCY_BOOST,
  )
}
