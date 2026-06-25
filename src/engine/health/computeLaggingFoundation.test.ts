import { describe, expect, it } from 'vitest'
import type { Dependency, ID } from '@/core/types'
import { computeLaggingFoundation } from './computeLaggingFoundation'

function edge(fromId: string, toId: string): Dependency {
  return {
    id: `${fromId}->${toId}`,
    fromId,
    toId,
    type: 'subgoal',
    createdAt: '2026-06-22',
  }
}

function completions(entries: Record<string, number>): ReadonlyMap<ID, number> {
  return new Map(Object.entries(entries))
}

describe('computeLaggingFoundation', () => {
  it('returns null when there are no edges', () => {
    expect(computeLaggingFoundation([], completions({ A: 0, B: 90 }))).toBeNull()
  })

  it('flags a foundation that trails its active dependent by the margin', () => {
    // A supports B; A is at 20%, B at 70% -> B leans on a lagging foundation.
    const result = computeLaggingFoundation(
      [edge('A', 'B')],
      completions({ A: 20, B: 70 }),
    )
    expect(result).toEqual({ foundationId: 'A', dependentId: 'B' })
  })

  it('does not flag when the gap is below the margin', () => {
    // 60 - 50 = 10 points, under the 25-point threshold.
    expect(
      computeLaggingFoundation([edge('A', 'B')], completions({ A: 50, B: 60 })),
    ).toBeNull()
  })

  it('does not flag when the foundation is ahead of its dependent', () => {
    expect(
      computeLaggingFoundation([edge('A', 'B')], completions({ A: 80, B: 30 })),
    ).toBeNull()
  })

  it('ignores a dependent that is already complete', () => {
    // B is done (100%): it no longer leans on A, so a lagging A is not flagged.
    expect(
      computeLaggingFoundation([edge('A', 'B')], completions({ A: 10, B: 100 })),
    ).toBeNull()
  })

  it('ignores cross-goal edges (an endpoint outside this goal)', () => {
    // 'X' is not in this goal's completion map -> the edge is skipped entirely.
    expect(
      computeLaggingFoundation([edge('X', 'B')], completions({ A: 0, B: 90 })),
    ).toBeNull()
  })

  it('surfaces the worst imbalance when several foundations lag', () => {
    // A->B gap 60 (10 vs 70); C->D gap 30 (50 vs 80). A->B is the worst.
    const result = computeLaggingFoundation(
      [edge('C', 'D'), edge('A', 'B')],
      completions({ A: 10, B: 70, C: 50, D: 80 }),
    )
    expect(result).toEqual({ foundationId: 'A', dependentId: 'B' })
  })
})
