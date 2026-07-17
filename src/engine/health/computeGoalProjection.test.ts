import { describe, it, expect } from 'vitest'
import { computeGoalProjection } from './computeGoalProjection'
import type { Completion } from '@/engine/progress/computeCompletion'

// created -> target spans 20 days; "now" is the 10-day mark (50% of time elapsed).
const CREATED = '2026-01-01'
const TARGET = '2026-01-21'
const NOW = new Date(2026, 0, 11) // local midnight, Jan 11 2026

function completion(percent: number): Completion {
  return { completed: percent, total: 100, percent }
}

describe('computeGoalProjection', () => {
  it('projects a finish date past target and days-behind when behind pace', () => {
    // 25% done at the halfway mark -> ~2.5%/day -> ~30 more days -> ~Feb 10.
    const p = computeGoalProjection(CREATED, TARGET, completion(25), NOW)
    expect(p.projectedDate).not.toBeNull()
    expect(p.projectedDate?.startsWith('2026-02')).toBe(true)
    expect(p.daysBehind).toBeGreaterThan(15)
    expect(p.daysBehind).toBeLessThan(25)
  })

  it('reports no days behind when on or ahead of pace', () => {
    // 50% at the halfway mark -> right on schedule.
    const p = computeGoalProjection(CREATED, TARGET, completion(50), NOW)
    expect(p.daysBehind).toBe(0)
    expect(p.projectedDate).not.toBeNull()
  })

  it('is not projectable with no progress yet', () => {
    expect(computeGoalProjection(CREATED, TARGET, completion(0), NOW)).toEqual({
      projectedDate: null,
      daysBehind: 0,
    })
  })

  it('is not projectable when the goal has no tasks', () => {
    const p = computeGoalProjection(CREATED, TARGET, { completed: 0, total: 0, percent: 0 }, NOW)
    expect(p).toEqual({ projectedDate: null, daysBehind: 0 })
  })

  it('treats a completed goal as finished now and not behind', () => {
    const p = computeGoalProjection(CREATED, TARGET, completion(100), NOW)
    expect(p.daysBehind).toBe(0)
    expect(p.projectedDate).not.toBeNull()
  })

  it('is not projectable before any time has elapsed', () => {
    const p = computeGoalProjection(CREATED, TARGET, completion(20), new Date(2026, 0, 1))
    expect(p).toEqual({ projectedDate: null, daysBehind: 0 })
  })
})
