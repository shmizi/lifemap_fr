import { describe, expect, it } from 'vitest'
import type { Completion } from '@/engine/progress/computeCompletion'
import { computeGoalHealth } from './computeGoalHealth'

// A goal created at the start of 2026, due mid-year. "Now" is set per test to
// place us at a known fraction of that window.
const CREATED = '2026-01-01T00:00:00.000Z'
const TARGET = '2026-07-01T00:00:00.000Z' // ~181 days later
// Roughly the halfway point of the window -> expected pace ~50%.
const HALFWAY = new Date('2026-04-01T00:00:00.000Z')

function completion(percent: number, total = 10): Completion {
  return { completed: Math.round((percent / 100) * total), total, percent }
}

describe('computeGoalHealth', () => {
  it('reports no_tasks for a goal with nothing to do', () => {
    const health = computeGoalHealth(CREATED, TARGET, completion(0, 0), HALFWAY)
    expect(health.status).toBe('no_tasks')
  })

  it('is on_track when completion keeps up with elapsed time', () => {
    // ~50% done at the ~50% mark.
    const health = computeGoalHealth(CREATED, TARGET, completion(50), HALFWAY)
    expect(health.status).toBe('on_track')
    expect(health.score).toBe(100)
    expect(health.expectedPercent).toBeGreaterThan(40)
    expect(health.expectedPercent).toBeLessThan(60)
  })

  it('is on_track (score capped at 100) when ahead of pace', () => {
    const health = computeGoalHealth(CREATED, TARGET, completion(90), HALFWAY)
    expect(health.status).toBe('on_track')
    expect(health.score).toBe(100)
  })

  it('is at_risk when moderately behind pace', () => {
    // ~50% expected, only ~30% done -> ~20 points behind.
    const health = computeGoalHealth(CREATED, TARGET, completion(30), HALFWAY)
    expect(health.status).toBe('at_risk')
    expect(health.score).toBeLessThan(100)
    expect(health.score).toBeGreaterThan(0)
  })

  it('is behind when far off pace', () => {
    // ~50% expected, only ~5% done -> ~45 points behind.
    const health = computeGoalHealth(CREATED, TARGET, completion(5), HALFWAY)
    expect(health.status).toBe('behind')
  })

  it('treats an overdue, unfinished goal as behind', () => {
    const past = new Date('2026-12-01T00:00:00.000Z') // well past target
    const health = computeGoalHealth(CREATED, TARGET, completion(40), past)
    expect(health.status).toBe('behind')
  })

  it('is on_track when fully complete, regardless of time elapsed', () => {
    const past = new Date('2026-12-01T00:00:00.000Z')
    const health = computeGoalHealth(CREATED, TARGET, completion(100), past)
    expect(health.status).toBe('on_track')
    expect(health.score).toBe(100)
  })

  it('does not penalise a brand-new goal (no time elapsed yet)', () => {
    const justCreated = new Date(CREATED)
    const health = computeGoalHealth(CREATED, TARGET, completion(0), justCreated)
    expect(health.status).toBe('on_track')
  })
})
