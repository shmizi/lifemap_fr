import { describe, it, expect } from 'vitest'
import type { SlipEvent, SlipReason } from '@/core/types'
import { computeSlipInsights } from '@/engine/health/computeSlipInsights'

const NOW = new Date('2026-07-21T12:00:00.000Z')

let seq = 0
function ev(reason: SlipReason, daysAgo: number): SlipEvent {
  seq += 1
  const at = new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
  return { id: `e${seq}`, taskId: `t${seq}`, goalId: 'g1', reason, at }
}

describe('computeSlipInsights', () => {
  it('stays quiet below the minimum event count', () => {
    expect(computeSlipInsights([ev('no_time', 1), ev('no_time', 2)], NOW)).toBeNull()
  })

  it('stays quiet when no single reason dominates', () => {
    const r = computeSlipInsights(
      [ev('no_time', 1), ev('dependency', 2), ev('external', 3), ev('higher_priority', 4)],
      NOW,
    )
    expect(r).toBeNull()
  })

  it('surfaces the dominant reason with a share and a suggestion', () => {
    const r = computeSlipInsights(
      [ev('no_time', 1), ev('no_time', 2), ev('no_time', 5), ev('dependency', 3)],
      NOW,
    )
    expect(r).not.toBeNull()
    expect(r!.reason).toBe('no_time')
    expect(r!.count).toBe(3)
    expect(r!.total).toBe(4)
    expect(r!.share).toBeCloseTo(0.75)
    expect(r!.text).toMatch(/75%/)
    expect(r!.text).toMatch(/weekly load/i)
  })

  it('ignores events outside the window', () => {
    const r = computeSlipInsights(
      [
        ev('no_time', 1),
        ev('no_time', 2),
        ev('no_time', 3),
        ev('dependency', 60), // old — excluded
        ev('dependency', 90), // old — excluded
      ],
      NOW,
    )
    expect(r).not.toBeNull()
    expect(r!.reason).toBe('no_time')
    expect(r!.total).toBe(3) // the two old dependency events dropped out
  })

  it('ignores unspecified (skipped) reasons', () => {
    const r = computeSlipInsights(
      [
        ev('dependency', 1),
        ev('dependency', 2),
        ev('dependency', 3),
        ev('unspecified', 1),
        ev('unspecified', 1),
      ],
      NOW,
    )
    expect(r).not.toBeNull()
    expect(r!.reason).toBe('dependency')
    expect(r!.total).toBe(3)
    expect(r!.text).toMatch(/prerequisite/i)
  })
})
