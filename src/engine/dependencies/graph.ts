// Shared graph primitives for the dependency engine (Phase 3).
//
// PURE TypeScript: no React, no DB, no store. A Dependency edge means "fromId
// must complete before toId", so the directed edge runs fromId -> toId. Both
// cycle detection and topological sorting need the same two views of an edge
// list — the set of participating nodes, and a fromId -> [toId] adjacency map —
// so they are built here once rather than re-derived in each module. This is a
// concrete shared helper for two existing callers, not a speculative abstraction.
//
// SCOPE: these treat the edge list opaquely. They do NOT filter by Dependency
// `type` ('subgoal' | 'task'); mixing those two id namespaces into one graph is
// nonsensical, so the CALLER is responsible for passing a single coherent graph
// (e.g. only task edges, or only subgoal edges).

import type { Dependency, ID } from '@/core/types'

// Every node that participates in at least one edge, in first-seen order
// (fromId before toId, edges in array order). That stable order is what makes
// the topological sort deterministic. Isolated entities with no dependencies
// are intentionally absent — they are unconstrained and belong to no ordering.
export function collectNodes(edges: Dependency[]): ID[] {
  const nodes: ID[] = []
  const seen = new Set<ID>()
  const add = (id: ID): void => {
    if (!seen.has(id)) {
      seen.add(id)
      nodes.push(id)
    }
  }
  for (const edge of edges) {
    add(edge.fromId)
    add(edge.toId)
  }
  return nodes
}

// fromId -> the list of toIds it points at (its successors / the things it
// blocks). Preserves edge order. Duplicate edges produce duplicate successor
// entries; both callers tolerate this — cycle detection short-circuits on the
// first back-edge, and Kahn's in-degree counting stays internally consistent
// because each duplicate edge is counted on the way in and decremented on the
// way out.
export function buildAdjacency(edges: Dependency[]): Map<ID, ID[]> {
  const adjacency = new Map<ID, ID[]>()
  for (const edge of edges) {
    const successors = adjacency.get(edge.fromId) ?? []
    successors.push(edge.toId)
    adjacency.set(edge.fromId, successors)
  }
  return adjacency
}
