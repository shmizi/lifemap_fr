// topologicalSort — order a dependency graph so every supporter comes before the
// thing it supports (Phase 3).
//
// PURE TypeScript: no React, no DB, no store. A Dependency edge fromId -> toId
// means "fromId supports/strengthens toId" (a soft link), so in the returned
// order a supporter precedes what it supports. Uses Kahn's algorithm: repeatedly
// emit any node with no remaining upstream supporters (in-degree 0), then relax
// its successors. This also reveals a cycle for free — if some nodes never reach
// in-degree 0, they are tangled in a loop and cannot be placed.
//
// SCOPE: only nodes that participate in an edge are ordered (see collectNodes).
// An entity with no dependencies is unconstrained; placing it is the caller's
// job. This does NOT detect WHICH nodes form a cycle — use findCycle for that.

import type { Dependency, ID } from '@/core/types'
import { buildAdjacency, collectNodes } from './graph'

export interface TopologicalSortResult {
  // Participating nodes in dependency order (prerequisite before dependent).
  // On a cycle this holds the orderable prefix only — the tangled nodes are
  // omitted, since no valid position exists for them.
  order: ID[]
  // True when a cycle prevented a complete ordering. When true, order.length is
  // strictly less than the number of participating nodes.
  cyclic: boolean
}

export function topologicalSort(edges: Dependency[]): TopologicalSortResult {
  const nodes = collectNodes(edges)
  const adjacency = buildAdjacency(edges)

  // in-degree = how many prerequisites still sit ahead of each node.
  const inDegree = new Map<ID, number>()
  for (const node of nodes) inDegree.set(node, 0)
  for (const edge of edges) {
    inDegree.set(edge.toId, (inDegree.get(edge.toId) ?? 0) + 1)
  }

  // Seed with everything that has no prerequisites, in first-seen order so the
  // result is deterministic for a given edge list. Used as a FIFO queue.
  const queue: ID[] = nodes.filter((node) => inDegree.get(node) === 0)
  const order: ID[] = []

  while (queue.length > 0) {
    const node = queue.shift()
    if (node === undefined) break
    order.push(node)
    for (const successor of adjacency.get(node) ?? []) {
      const remaining = (inDegree.get(successor) ?? 0) - 1
      inDegree.set(successor, remaining)
      // Freed: every prerequisite of `successor` has now been emitted.
      if (remaining === 0) queue.push(successor)
    }
  }

  // Fewer emitted than exist means the leftovers feed into a cycle and were
  // never freed to in-degree 0.
  return { order, cyclic: order.length < nodes.length }
}
