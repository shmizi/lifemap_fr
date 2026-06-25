import { describe, expect, it } from 'vitest'
import type { Dependency, ID, Task } from '@/core/types'
import { computeStrengthenedFoundations } from './computeStrengthenedFoundations'

function edge(fromId: string, toId: string): Dependency {
  return {
    id: `${fromId}->${toId}`,
    fromId,
    toId,
    type: 'subgoal',
    createdAt: '2026-06-22',
  }
}

// A minimal completed task under a given subgoal — only the fields this engine
// reads (subgoalId) matter; the rest satisfy the type.
function completedTask(subgoalId: ID, id: string): Task {
  return {
    id,
    subgoalId,
    title: id,
    status: 'completed',
    priority: 'medium',
    isRecurring: false,
    order: 0,
    completedAt: '2026-06-20T10:00:00.000Z',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-20T10:00:00.000Z',
  }
}

describe('computeStrengthenedFoundations', () => {
  it('returns nothing when no completed tasks', () => {
    expect(
      computeStrengthenedFoundations([], [edge('A', 'B')], new Set()),
    ).toEqual([])
  })

  it('flags a subgoal advanced this week that supports active work', () => {
    // A supports B; the user completed a task under A this week.
    const result = computeStrengthenedFoundations(
      [completedTask('A', 't1')],
      [edge('A', 'B')],
      new Set(),
    )
    expect(result).toEqual([{ subgoalId: 'A', activeSupportCount: 1 }])
  })

  it('ignores advanced subgoals that support nothing active', () => {
    // The user advanced B, but B supports nothing -> not a foundation.
    const result = computeStrengthenedFoundations(
      [completedTask('B', 't1')],
      [edge('A', 'B')],
      new Set(),
    )
    expect(result).toEqual([])
  })

  it('ignores a foundation the user did not touch this week', () => {
    // A is a foundation but nothing under it was completed in the window.
    const result = computeStrengthenedFoundations(
      [completedTask('B', 't1')],
      [edge('A', 'B'), edge('B', 'C')],
      new Set(),
    )
    // B was advanced and supports C (active) -> B qualifies; A does not.
    expect(result).toEqual([{ subgoalId: 'B', activeSupportCount: 1 }])
  })

  it('does not count support of an already-completed subgoal', () => {
    // A supports only B, which is already complete -> A lifts nothing active.
    const result = computeStrengthenedFoundations(
      [completedTask('A', 't1')],
      [edge('A', 'B')],
      new Set(['B']),
    )
    expect(result).toEqual([])
  })

  it('orders by leverage (most active supported first)', () => {
    // A supports B and C; D supports E. User advanced A and D this week.
    const result = computeStrengthenedFoundations(
      [completedTask('A', 't1'), completedTask('D', 't2')],
      [edge('A', 'B'), edge('A', 'C'), edge('D', 'E')],
      new Set(),
    )
    expect(result).toEqual([
      { subgoalId: 'A', activeSupportCount: 2 },
      { subgoalId: 'D', activeSupportCount: 1 },
    ])
  })

  it('counts a subgoal once even with several completed tasks under it', () => {
    const result = computeStrengthenedFoundations(
      [completedTask('A', 't1'), completedTask('A', 't2')],
      [edge('A', 'B')],
      new Set(),
    )
    expect(result).toEqual([{ subgoalId: 'A', activeSupportCount: 1 }])
  })
})
