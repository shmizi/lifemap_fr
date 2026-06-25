import { describe, expect, it } from 'vitest'
import type { Dependency, ID } from '@/core/types'
import { buildRoadmap } from './buildRoadmap'

function edge(fromId: string, toId: string): Dependency {
  return {
    id: `${fromId}->${toId}`,
    fromId,
    toId,
    type: 'subgoal',
    createdAt: '2026-06-22',
  }
}

const noneComplete: ReadonlySet<ID> = new Set()

describe('buildRoadmap', () => {
  it('keeps every subgoal even with no edges, in display order', () => {
    const layout = buildRoadmap(['A', 'B', 'C'], [], noneComplete)
    expect(layout.order).toEqual(['A', 'B', 'C'])
    expect(layout.cyclic).toBe(false)
    expect(layout.nodes['A']).toEqual({
      subgoalId: 'A',
      supportedByIds: [],
      supportsIds: [],
      activeSupportCount: 0,
    })
  })

  it('orders supporters before what they support', () => {
    // A supports B supports C.
    const layout = buildRoadmap(
      ['C', 'B', 'A'],
      [edge('A', 'B'), edge('B', 'C')],
      noneComplete,
    )
    expect(layout.order).toEqual(['A', 'B', 'C'])
  })

  it('records each node supportedBy / supports adjacency', () => {
    const layout = buildRoadmap(['A', 'B'], [edge('A', 'B')], noneComplete)
    expect(layout.nodes['A'].supportsIds).toEqual(['B'])
    expect(layout.nodes['A'].supportedByIds).toEqual([])
    expect(layout.nodes['B'].supportedByIds).toEqual(['A'])
    expect(layout.nodes['B'].supportsIds).toEqual([])
  })

  it('counts only active (not-yet-complete) supported subgoals', () => {
    // A supports both B and C; C is already complete, so A actively supports 1.
    const layout = buildRoadmap(
      ['A', 'B', 'C'],
      [edge('A', 'B'), edge('A', 'C')],
      new Set(['C']),
    )
    expect(layout.nodes['A'].activeSupportCount).toBe(1)
  })

  it('ignores cross-goal edges (an endpoint outside this goal)', () => {
    // 'X' is not one of this goal's subgoals, so the edge is dropped entirely.
    const layout = buildRoadmap(['A', 'B'], [edge('X', 'A'), edge('A', 'B')], noneComplete)
    expect(layout.nodes['A'].supportedByIds).toEqual([])
    expect(layout.nodes['A'].supportsIds).toEqual(['B'])
    expect(layout.order).toEqual(['A', 'B'])
    expect(layout.cyclic).toBe(false)
  })

  it('flags a cycle but still includes every subgoal', () => {
    // B -> C -> B is a loop; A is a clean root, D is unconstrained.
    const layout = buildRoadmap(
      ['A', 'B', 'C', 'D'],
      [edge('A', 'B'), edge('B', 'C'), edge('C', 'B')],
      noneComplete,
    )
    expect(layout.cyclic).toBe(true)
    expect([...layout.order].sort()).toEqual(['A', 'B', 'C', 'D'])
    // A still leads (it is orderable); the tangled nodes are appended, not dropped.
    expect(layout.order[0]).toBe('A')
  })

  it('does not flag a cycle merely because some subgoals have no edges', () => {
    const layout = buildRoadmap(['A', 'B', 'C'], [edge('A', 'B')], noneComplete)
    expect(layout.cyclic).toBe(false)
  })
})
