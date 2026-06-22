import { describe, expect, it } from 'vitest'
import type { Dependency } from '@/core/types'
import { findCycle, hasCycle, wouldCreateCycle } from './detectCycle'

// Minimal valid Dependency edge. `type` is fixed to 'task' — these functions
// treat the edge list opaquely, so the value is irrelevant to the graph math.
function edge(fromId: string, toId: string): Dependency {
  return {
    id: `${fromId}->${toId}`,
    fromId,
    toId,
    type: 'task',
    createdAt: '2026-06-22',
  }
}

describe('findCycle', () => {
  it('returns null for an empty graph', () => {
    expect(findCycle([])).toBeNull()
  })

  it('returns null for an acyclic chain', () => {
    expect(findCycle([edge('A', 'B'), edge('B', 'C')])).toBeNull()
  })

  it('returns null for a diamond (shared dependency, no loop)', () => {
    const diamond = [
      edge('A', 'B'),
      edge('A', 'C'),
      edge('B', 'D'),
      edge('C', 'D'),
    ]
    expect(findCycle(diamond)).toBeNull()
  })

  it('reports the nodes forming a simple cycle as a closed path', () => {
    const loop = [edge('A', 'B'), edge('B', 'C'), edge('C', 'A')]
    expect(findCycle(loop)).toEqual(['A', 'B', 'C', 'A'])
  })

  it('detects a self-dependency as a one-node loop', () => {
    expect(findCycle([edge('A', 'A')])).toEqual(['A', 'A'])
  })

  it('finds a cycle that sits inside an otherwise-acyclic graph', () => {
    // D -> E -> D is the loop; A -> B -> C is a separate clean chain.
    const mixed = [
      edge('A', 'B'),
      edge('B', 'C'),
      edge('D', 'E'),
      edge('E', 'D'),
    ]
    const cycle = findCycle(mixed)
    expect(cycle).toEqual(['D', 'E', 'D'])
  })
})

describe('hasCycle', () => {
  it('is false for an acyclic graph and true for a loop', () => {
    expect(hasCycle([edge('A', 'B'), edge('B', 'C')])).toBe(false)
    expect(hasCycle([edge('A', 'B'), edge('B', 'A')])).toBe(true)
  })
})

describe('wouldCreateCycle', () => {
  it('is true when the new edge closes an existing path back to the source', () => {
    // A -> B -> C already exists; adding C -> A would close A -> B -> C -> A.
    const edges = [edge('A', 'B'), edge('B', 'C')]
    expect(wouldCreateCycle(edges, 'C', 'A')).toBe(true)
  })

  it('is false for a safe shortcut edge that keeps the graph acyclic', () => {
    // A -> B -> C exists; adding A -> C is a redundant shortcut, no loop.
    const edges = [edge('A', 'B'), edge('B', 'C')]
    expect(wouldCreateCycle(edges, 'A', 'C')).toBe(false)
  })

  it('is true for a self-dependency regardless of existing edges', () => {
    expect(wouldCreateCycle([], 'X', 'X')).toBe(true)
    expect(wouldCreateCycle([edge('A', 'B')], 'A', 'A')).toBe(true)
  })

  it('is false when the two endpoints are unrelated', () => {
    expect(wouldCreateCycle([edge('A', 'B')], 'C', 'D')).toBe(false)
  })

  it('does not mutate the edge list it inspects', () => {
    const edges = [edge('A', 'B'), edge('B', 'C')]
    const before = edges.length
    wouldCreateCycle(edges, 'C', 'A')
    expect(edges).toHaveLength(before)
  })
})
