// detectCycle — find dependency loops before they break the graph (Phase 3).
//
// PURE TypeScript: no React, no DB, no store. A Dependency edge fromId -> toId
// means "fromId must complete before toId". A cycle (A before B before A) is an
// impossible constraint: nothing in the loop could ever start. These functions
// answer three related questions over an edge list:
//   - findCycle: IS there a loop, and if so which nodes form it?
//   - hasCycle:  IS there a loop? (boolean shorthand)
//   - wouldCreateCycle: would adding ONE new edge introduce a loop? (the guard
//     a caller runs BEFORE persisting a new dependency, so a bad edge is never
//     written in the first place)
//
// SCOPE: pure graph math only. This does NOT decide what to do about a cycle
// (reject the edge, warn the user, auto-break it) — that is the store/UI's call.

import type { Dependency, ID } from '@/core/types'
import { buildAdjacency, collectNodes } from './graph'

// DFS node colors: unvisited, on the current path, fully explored.
const WHITE = 0
const GRAY = 1
const BLACK = 2

// Returns the nodes forming a cycle as a closed path (e.g. ['A','B','C','A'])
// or null when the graph is acyclic. Uses a depth-first walk: a back-edge to a
// node still on the current path (GRAY) closes a loop, and the path stack lets
// us report exactly which nodes are tangled rather than just "a cycle exists".
export function findCycle(edges: Dependency[]): ID[] | null {
  const adjacency = buildAdjacency(edges)
  const nodes = collectNodes(edges)

  const color = new Map<ID, number>()
  for (const node of nodes) color.set(node, WHITE)

  // The current DFS path of GRAY (in-progress) nodes, used to reconstruct the
  // loop when a back-edge is found.
  const path: ID[] = []

  const visit = (node: ID): ID[] | null => {
    color.set(node, GRAY)
    path.push(node)

    for (const next of adjacency.get(node) ?? []) {
      const nextColor = color.get(next)
      if (nextColor === GRAY) {
        // Back-edge: the cycle is the path slice from `next` to the current
        // node, closed by appending `next` again so the loop reads end-to-end.
        return path.slice(path.indexOf(next)).concat(next)
      }
      if (nextColor === WHITE) {
        const found = visit(next)
        if (found) return found
      }
    }

    path.pop()
    color.set(node, BLACK)
    return null
  }

  for (const node of nodes) {
    if (color.get(node) === WHITE) {
      const found = visit(node)
      if (found) return found
    }
  }
  return null
}

export function hasCycle(edges: Dependency[]): boolean {
  return findCycle(edges) !== null
}

// Would adding the edge fromId -> toId to `edges` create a cycle? A new edge
// fromId -> toId closes a loop exactly when toId can ALREADY reach fromId in the
// existing graph (then fromId -> toId -> ... -> fromId). A self-dependency
// (fromId === toId) is the degenerate one-node loop. This never mutates `edges`.
export function wouldCreateCycle(
  edges: Dependency[],
  fromId: ID,
  toId: ID,
): boolean {
  if (fromId === toId) return true

  const adjacency = buildAdjacency(edges)

  // Depth-first reachability from toId, looking for fromId.
  const seen = new Set<ID>()
  const stack: ID[] = [toId]
  while (stack.length > 0) {
    const node = stack.pop()
    if (node === undefined) break
    if (node === fromId) return true
    if (seen.has(node)) continue
    seen.add(node)
    for (const next of adjacency.get(node) ?? []) stack.push(next)
  }
  return false
}
