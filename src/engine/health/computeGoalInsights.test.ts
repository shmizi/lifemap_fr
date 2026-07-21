import { describe, it, expect } from 'vitest'
import { computeGoalInsights } from '@/engine/health/computeGoalInsights'
import type { Reliability } from '@/engine/health/computeReliability'

function reliability(overrides: Partial<Reliability>): Reliability {
  return {
    score: 100,
    status: 'reliable',
    reschedules: 0,
    lateCompletions: 0,
    onTimeCompletions: 0,
    openMisses: 0,
    ...overrides,
  }
}

describe('computeGoalInsights', () => {
  it('returns nothing to interpret for an unassessable goal', () => {
    expect(
      computeGoalInsights({
        progressPercent: 0,
        paceStatus: 'no_tasks',
        reliability: reliability({ status: 'no_history' }),
        riskLevel: 'low',
      }),
    ).toEqual([])
  })

  it('reassures only when genuinely healthy', () => {
    const out = computeGoalInsights({
      progressPercent: 60,
      paceStatus: 'on_track',
      reliability: reliability({ status: 'reliable', onTimeCompletions: 5 }),
      riskLevel: 'low',
    })
    expect(out).toHaveLength(1)
    expect(out[0].tone).toBe('positive')
  })

  it('narrates the slip and suggests a lighter load when reliability is low', () => {
    const out = computeGoalInsights({
      progressPercent: 20,
      paceStatus: 'on_track',
      reliability: reliability({
        status: 'unreliable',
        score: 40,
        reschedules: 8,
        lateCompletions: 2,
      }),
      riskLevel: 'medium',
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0].text).toMatch(/8 reschedules/)
    expect(out[0].text).toMatch(/2 late finishes/)
    expect(out[0].tone).toBe('warning')
  })

  it('leads with a high-risk headline', () => {
    const out = computeGoalInsights({
      progressPercent: 30,
      paceStatus: 'behind',
      reliability: reliability({ status: 'unreliable', reschedules: 5, openMisses: 3 }),
      riskLevel: 'high',
    })
    expect(out[0].text).toMatch(/High risk/i)
  })

  it('flags the "good progress, but consistency" nuance', () => {
    const out = computeGoalInsights({
      progressPercent: 70,
      paceStatus: 'on_track',
      reliability: reliability({ status: 'wavering', score: 62, reschedules: 3 }),
      riskLevel: 'medium',
    })
    expect(out.some((i) => /consistency is the real risk/i.test(i.text))).toBe(true)
  })
})
