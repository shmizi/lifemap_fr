import { describe, it, expect } from 'vitest'
import { packSessionsIntoDays, type PackSession } from './packSessionsIntoDays'

// 2026-06-25 is a Thursday (matches scheduleDailyTasks.test).
const start = new Date(2026, 5, 25)

function sessions(n: number, minutes: number): PackSession[] {
  return Array.from({ length: n }, (_, i) => ({
    subgoalId: `sg-${i % 2}`,
    title: `S${i}`,
    minutes,
  }))
}

describe('packSessionsIntoDays', () => {
  it('fills each day up to the budget, spilling to the next day', () => {
    // budget 60, sessions 30 -> 2 per day.
    const packed = packSessionsIntoDays(sessions(4, 30), {
      startDate: start,
      dailyBudgetMinutes: 60,
    })
    expect(packed.map((p) => p.scheduledDate)).toEqual([
      '2026-06-25',
      '2026-06-25',
      '2026-06-26',
      '2026-06-26',
    ])
  })

  it('places a session larger than the whole budget alone on its own day', () => {
    const packed = packSessionsIntoDays(
      [
        { subgoalId: 'a', title: 'big', minutes: 90 },
        { subgoalId: 'b', title: 'next', minutes: 30 },
      ],
      { startDate: start, dailyBudgetMinutes: 60 },
    )
    expect(packed.map((p) => p.scheduledDate)).toEqual([
      '2026-06-25',
      '2026-06-26',
    ])
  })

  it('skips days off (Thu+Fri fill, then weekend skipped -> Mon)', () => {
    // budget 30, sessions 30 -> 1 per day; 3 sessions across Thu, Fri, Mon.
    const packed = packSessionsIntoDays(sessions(3, 30), {
      startDate: start,
      dailyBudgetMinutes: 30,
      skipWeekdays: [0, 6],
    })
    expect(packed.map((p) => p.scheduledDate)).toEqual([
      '2026-06-25',
      '2026-06-26',
      '2026-06-29',
    ])
  })

  it('drops sessions beyond the maxDays window', () => {
    // 1 per day, but only 2 calendar days allowed -> 2 placed, rest dropped.
    const packed = packSessionsIntoDays(sessions(5, 30), {
      startDate: start,
      dailyBudgetMinutes: 30,
      maxDays: 2,
    })
    expect(packed).toHaveLength(2)
    expect(packed.map((p) => p.scheduledDate)).toEqual([
      '2026-06-25',
      '2026-06-26',
    ])
  })

  it('preserves the given (interleaved) order and keeps subgoal ids', () => {
    const input: PackSession[] = [
      { subgoalId: 'x', title: 'x1', minutes: 20 },
      { subgoalId: 'y', title: 'y1', minutes: 20 },
    ]
    const packed = packSessionsIntoDays(input, {
      startDate: start,
      dailyBudgetMinutes: 60,
    })
    expect(packed.map((p) => p.subgoalId)).toEqual(['x', 'y'])
    expect(packed.map((p) => p.title)).toEqual(['x1', 'y1'])
  })

  it('returns an empty plan for no sessions', () => {
    expect(
      packSessionsIntoDays([], { startDate: start, dailyBudgetMinutes: 60 }),
    ).toEqual([])
  })
})
