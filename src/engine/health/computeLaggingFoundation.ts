// computeLaggingFoundation — a SEPARATE dependency-based Goal Health signal
// (Phase 4): is a subgoal that others depend on falling behind the work that
// leans on it?
//
// PURE TypeScript: no React, no DB, no store.
//
// WHY a sibling of computeGoalHealth, not folded into it: Goal Health's pace
// score stays ONE contributor, ONE sentence (completion vs. elapsed time). This
// is a DISTINCT signal with its OWN one-line explanation — "a foundation subgoal
// is trailing the work that leans on it" — so per the project's governing rule it
// is computed and shown separately, never blended into the pace number.
//
// SOFT model: an edge fromId -> toId means "fromId supports/strengthens toId."
// So fromId is the foundation and toId leans on it. The signal fires when a
// foundation's completion trails a still-active dependent's by a clear margin —
// you are racing ahead on something while the subgoal meant to strengthen it lags.

import type { Dependency, ID } from '@/core/types'

// A foundation trailing a dependent by more than this many completion points is a
// real imbalance worth a nudge, not normal jitter. Kept high enough that small
// leads don't cry wolf — this informs, it does not alarm.
export const LAGGING_FOUNDATION_MARGIN_POINTS = 25

export interface LaggingFoundation {
  // The foundational subgoal that is behind (the support: an edge's fromId).
  foundationId: ID
  // The still-active dependent racing ahead of it (the largest-gap toId).
  dependentId: ID
}

export function computeLaggingFoundation(
  subgoalEdges: Dependency[],
  // Completion percent (0..100) for every subgoal in THIS goal, keyed by id. Its
  // key set defines the goal's subgoals, so cross-goal edges are filtered out.
  completionBySubgoalId: ReadonlyMap<ID, number>,
): LaggingFoundation | null {
  let best: { foundationId: ID; dependentId: ID; gap: number } | null = null

  for (const edge of subgoalEdges) {
    // Only edges wholly inside this goal (both endpoints are known subgoals).
    if (
      !completionBySubgoalId.has(edge.fromId) ||
      !completionBySubgoalId.has(edge.toId)
    ) {
      continue
    }

    const dependentPercent = completionBySubgoalId.get(edge.toId) ?? 0
    // A finished dependent no longer "leans" on its foundation — the signal is
    // about active work resting on a weak base, so skip completed dependents.
    if (dependentPercent >= 100) continue

    const foundationPercent = completionBySubgoalId.get(edge.fromId) ?? 0
    const gap = dependentPercent - foundationPercent
    if (gap < LAGGING_FOUNDATION_MARGIN_POINTS) continue

    // Surface the worst imbalance. Strictly-greater keeps it deterministic for a
    // given edge order (first-seen wins on a tie).
    if (best === null || gap > best.gap) {
      best = { foundationId: edge.fromId, dependentId: edge.toId, gap }
    }
  }

  if (best === null) return null
  return { foundationId: best.foundationId, dependentId: best.dependentId }
}
