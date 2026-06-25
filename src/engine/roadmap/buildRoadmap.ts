// buildRoadmap — assemble ONE goal's subgoals into a dependency-ordered roadmap
// (Phase 4). PURE TypeScript: no React, no DB, no store.
//
// SCOPE: one goal at a time. The caller passes this goal's subgoal ids (already
// in their display order) and the subgoal dependency graph; we keep only the
// edges WHOLLY inside this goal (both endpoints among these subgoals), because
// the roadmap shows a single goal and a cross-goal edge has no station to connect
// to here.
//
// LAYOUT-AGNOSTIC ON PURPOSE: the result describes each subgoal's place in
// dependency order plus its supporters / supported and active-support count — not
// pixels. The first UI renders this as a simple ordered list of "stations"; a
// richer metro map later can consume the SAME structure without touching this
// engine. That is the whole reason the ordering math lives here, not in the view.
//
// SOFT model (unchanged from Phase 3): an edge fromId -> toId means "fromId
// supports/strengthens toId." So in `order` a supporter precedes what it
// supports, and a subgoal's `supportedBy` are the edges pointing AT it. Nothing
// here ever gates or hides a subgoal — the roadmap always shows the whole goal.

import type { Dependency, ID } from '@/core/types'
import { topologicalSort } from '@/engine/dependencies/topologicalSort'
import { computeActiveSupportCounts } from '@/engine/priority/dependencyBoost'

export interface RoadmapNode {
  subgoalId: ID
  // Subgoals that strengthen this one (incoming edges) — its soft "prerequisites".
  supportedByIds: ID[]
  // Subgoals this one strengthens (outgoing edges) — its downstream.
  supportsIds: ID[]
  // How many of the subgoals it supports are NOT yet complete (active out-degree).
  // The same signal the dashboard shows as "Supports N active subgoals".
  activeSupportCount: number
}

export interface RoadmapLayout {
  // Every subgoal id, dependency-ordered: a supporter before what it supports.
  // The orderable nodes come first (topological order); subgoals with no edges,
  // and any caught in a cycle, follow in the caller's display order so nothing is
  // ever dropped (the roadmap shows the whole goal — soft model).
  order: ID[]
  // Per-subgoal graph facts, keyed by subgoalId. Every id in `order` has an entry.
  nodes: Record<ID, RoadmapNode>
  // True when a support cycle left some subgoals unorderable (they were appended
  // by display order). The UI can surface a calm note; it never blocks anything.
  cyclic: boolean
}

export function buildRoadmap(
  subgoalIds: ID[],
  subgoalEdges: Dependency[],
  completedSubgoalIds: ReadonlySet<ID>,
): RoadmapLayout {
  const idSet = new Set(subgoalIds)

  // Keep only edges wholly inside this goal — a roadmap of one goal cannot draw a
  // line to a station it does not contain.
  const intraEdges = subgoalEdges.filter(
    (e) => idSet.has(e.fromId) && idSet.has(e.toId),
  )

  const { order: topoOrder } = topologicalSort(intraEdges)
  const activeCounts = computeActiveSupportCounts(intraEdges, completedSubgoalIds)

  // Per-node adjacency, deduped, preserving edge order for a deterministic result.
  const supportedBy = new Map<ID, ID[]>()
  const supports = new Map<ID, ID[]>()
  const pushUnique = (map: Map<ID, ID[]>, key: ID, value: ID): void => {
    const list = map.get(key) ?? []
    if (!list.includes(value)) list.push(value)
    map.set(key, list)
  }
  for (const e of intraEdges) {
    pushUnique(supportedBy, e.toId, e.fromId)
    pushUnique(supports, e.fromId, e.toId)
  }

  // Full order: the dependency-respecting prefix (topological), then any remaining
  // subgoals — unconstrained, or tangled in a cycle — in display order. Nothing is
  // dropped. We re-derive `cyclic` from completeness rather than trusting the
  // topo flag alone: if every subgoal got an orderable position, there is no loop
  // to warn about.
  const placed = new Set(topoOrder)
  const order: ID[] = [
    ...topoOrder,
    ...subgoalIds.filter((id) => !placed.has(id)),
  ]
  // A cycle is the only reason an edge-participating subgoal fails to reach the
  // topological order. Unconstrained subgoals (no edges) are expected to be
  // missing from topoOrder and must NOT be read as a cycle — so check whether any
  // subgoal that actually participates in an edge was left unordered.
  const participating = new Set<ID>()
  for (const e of intraEdges) {
    participating.add(e.fromId)
    participating.add(e.toId)
  }
  const cyclic = [...participating].some((id) => !placed.has(id))

  const nodes: Record<ID, RoadmapNode> = {}
  for (const id of order) {
    nodes[id] = {
      subgoalId: id,
      supportedByIds: supportedBy.get(id) ?? [],
      supportsIds: supports.get(id) ?? [],
      activeSupportCount: activeCounts[id] ?? 0,
    }
  }

  return { order, nodes, cyclic }
}
