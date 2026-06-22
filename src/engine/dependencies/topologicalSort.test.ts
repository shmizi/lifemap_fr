import { describe, expect, it } from 'vitest'
import type { Dependency, ID } from '@/core/types'
import { topologicalSort } from './topologicalSort'

function edge(fromId: string, toId: string): Dependency {
  return {
    id: `${fromId}->${toId}`,
    fromId,
    toId,
    type: 'task',
    createdAt: '2026-06-22',
  }
}

// Assert the core invariant: for every edge, the prerequisite is emitted before
// the thing it blocks.
function expectPrereqsFirst(edges: Dependency[], order: ID[]): void {
  const position = new Map(order.map((id, index) => [id, index]))
  for (const e of edges) {
    expect(position.get(e.fromId)).toBeLessThan(position.get(e.toId) as number)
  }
}

describe('topologicalSort', () => {
  it('returns an empty, acyclic result for no edges', () => {
    expect(topologicalSort([])).toEqual({ order: [], cyclic: false })
  })

  it('orders a linear chain prerequisite-first', () => {
    const edges = [edge('A', 'B'), edge('B', 'C')]
    expect(topologicalSort(edges)).toEqual({
      order: ['A', 'B', 'C'],
      cyclic: false,
    })
  })

  it('orders a diamond with the source first and the sink last', () => {
    // A -> {B, C} -> D.
    const edges = [
      edge('A', 'B'),
      edge('A', 'C'),
      edge('B', 'D'),
      edge('C', 'D'),
    ]
    const result = topologicalSort(edges)

    expect(result.cyclic).toBe(false)
    expect(result.order[0]).toBe('A')
    expect(result.order[result.order.length - 1]).toBe('D')
    expectPrereqsFirst(edges, result.order)
  })

  it('is deterministic for a given edge list (first-seen tie-breaking)', () => {
    const edges = [
      edge('A', 'B'),
      edge('A', 'C'),
      edge('B', 'D'),
      edge('C', 'D'),
    ]
    expect(topologicalSort(edges).order).toEqual(['A', 'B', 'C', 'D'])
  })

  it('flags a cycle and omits the tangled nodes from the order', () => {
    // A is a clean root into the loop B -> C -> B.
    const edges = [edge('A', 'B'), edge('B', 'C'), edge('C', 'B')]
    const result = topologicalSort(edges)

    expect(result.cyclic).toBe(true)
    // A could still be placed; B and C are stuck in the loop.
    expect(result.order).toEqual(['A'])
    expect(result.order).not.toContain('B')
    expect(result.order).not.toContain('C')
  })

  it('omits isolated entities — only nodes with edges are ordered', () => {
    // No edge mentions 'Z', so it never appears; that is the caller's to place.
    const result = topologicalSort([edge('A', 'B')])
    expect(result.order).toEqual(['A', 'B'])
  })
})
