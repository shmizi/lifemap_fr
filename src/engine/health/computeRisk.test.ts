import { describe, it, expect } from 'vitest'
import { computeRisk } from '@/engine/health/computeRisk'

describe('computeRisk', () => {
  it('is low for a healthy goal (on pace, reliable, not projected late)', () => {
    const r = computeRisk({
      paceStatus: 'on_track',
      reliabilityStatus: 'reliable',
      daysBehind: 0,
      deadlineHardness: 'soft',
    })
    expect(r.level).toBe('low')
  })

  it('is low (no risk) for a goal with no tasks', () => {
    expect(
      computeRisk({
        paceStatus: 'no_tasks',
        reliabilityStatus: 'no_history',
        daysBehind: 40,
        deadlineHardness: 'hard',
      }).level,
    ).toBe('low')
  })

  it('rises to medium when reliability alone is poor even if pace looks fine', () => {
    const r = computeRisk({
      paceStatus: 'on_track',
      reliabilityStatus: 'unreliable', // +2
      daysBehind: 0,
      deadlineHardness: 'soft',
    })
    expect(r.level).toBe('medium')
  })

  it('is high when behind, projected seriously late, on a hard deadline', () => {
    const r = computeRisk({
      paceStatus: 'behind', // +2
      reliabilityStatus: 'wavering', // +1
      daysBehind: 30, // +2 (>=21)
      deadlineHardness: 'hard', // +1
    })
    expect(r.level).toBe('high')
    expect(r.points).toBeGreaterThanOrEqual(4)
  })

  it('counts a hard deadline as extra risk only when actually projected late', () => {
    const notLate = computeRisk({
      paceStatus: 'at_risk',
      reliabilityStatus: 'reliable',
      daysBehind: 0,
      deadlineHardness: 'hard',
    })
    const late = computeRisk({
      paceStatus: 'at_risk',
      reliabilityStatus: 'reliable',
      daysBehind: 5,
      deadlineHardness: 'hard',
    })
    expect(late.points).toBeGreaterThan(notLate.points)
  })
})
