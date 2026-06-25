import { describe, expect, it } from 'vitest'
import type { Dependency } from '@/core/types'
import {
  computeActiveSupportCounts,
  dependencyBoost,
  DEPENDENCY_BOOST_PER_ACTIVE_SUPPORT,
  MAX_DEPENDENCY_BOOST,
} from './dependencyBoost'

function edge(fromId: string, toId: string): Dependency {
  return {
    id: `${fromId}->${toId}`,
    fromId,
    toId,
    type: 'subgoal',
    createdAt: '2026-06-22',
  }
}

describe('computeActiveSupportCounts', () => {
  it('counts how many subgoals each supporter strengthens', () => {
    // A supports B and C; B supports C. Nothing completed.
    const edges = [edge('A', 'B'), edge('A', 'C'), edge('B', 'C')]
    const counts = computeActiveSupportCounts(edges, new Set())
    expect(counts).toEqual({ A: 2, B: 1 })
  })

  it('excludes edges whose supported subgoal is already complete', () => {
    // A supports B (done) and C (active) -> only C counts for A.
    const edges = [edge('A', 'B'), edge('A', 'C')]
    const counts = computeActiveSupportCounts(edges, new Set(['B']))
    expect(counts).toEqual({ A: 1 })
  })

  it('omits a supporter whose every supported subgoal is complete', () => {
    const edges = [edge('A', 'B')]
    const counts = computeActiveSupportCounts(edges, new Set(['B']))
    expect(counts).toEqual({})
  })

  it('returns an empty map for no edges', () => {
    expect(computeActiveSupportCounts([], new Set())).toEqual({})
  })
})

describe('dependencyBoost', () => {
  it('is 0 for no support', () => {
    expect(dependencyBoost(0)).toBe(0)
    expect(dependencyBoost(-1)).toBe(0)
  })

  it('scales linearly per active support up to the cap', () => {
    expect(dependencyBoost(1)).toBe(DEPENDENCY_BOOST_PER_ACTIVE_SUPPORT)
    expect(dependencyBoost(2)).toBe(2 * DEPENDENCY_BOOST_PER_ACTIVE_SUPPORT)
  })

  it('never exceeds the cap, however many subgoals are supported', () => {
    expect(dependencyBoost(100)).toBe(MAX_DEPENDENCY_BOOST)
  })

  it('stays smaller than one priority step (10 in scoreTask) — a tie-breaker, not a lever', () => {
    expect(MAX_DEPENDENCY_BOOST).toBeLessThan(10)
  })
})
