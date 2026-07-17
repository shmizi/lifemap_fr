import { describe, it, expect } from 'vitest'
import { rescheduleOverdue } from '@/engine/ai/rescheduleOverdue'

// 2026-06-25 is a Thursday. Local-time construction so day keys are timezone-safe.
const from = new Date(2026, 5, 25)

const items = (mins: number[]) =>
  mins.map((minutes, i) => ({ id: `t${i}`, minutes }))

describe('rescheduleOverdue', () => {
  it('returns an empty result for no items', () => {
    expect(rescheduleOverdue([], { from, dailyBudgetMinutes: 120 })).toEqual([])
  })

  it('fills a day to the budget, then spills to the next day', () => {
    // Budget 60: [30,30] fill day one, [30] spills to day two.
    const out = rescheduleOverdue(items([30, 30, 30]), {
      from,
      dailyBudgetMinutes: 60,
    })
    expect(out.map((r) => r.scheduledDate)).toEqual([
      '2026-06-25',
      '2026-06-25',
      '2026-06-26',
    ])
  })

  it('places a single over-budget item alone rather than dropping it', () => {
    const out = rescheduleOverdue(items([200, 30]), {
      from,
      dailyBudgetMinutes: 60,
    })
    expect(out[0].scheduledDate).toBe('2026-06-25') // alone
    expect(out[1].scheduledDate).toBe('2026-06-26') // next day
  })

  it('skips days off (Thu 06-25, then weekend [0,6] -> Fri, Mon)', () => {
    // Budget 30 so each item takes its own day. Fri 26 is a workday; Sat/Sun off.
    const out = rescheduleOverdue(items([30, 30, 30]), {
      from,
      dailyBudgetMinutes: 30,
      skipWeekdays: [0, 6],
    })
    expect(out.map((r) => r.scheduledDate)).toEqual([
      '2026-06-25',
      '2026-06-26',
      '2026-06-29',
    ])
  })

  it('soft deadline (no maxDate) spreads freely beyond any date', () => {
    const out = rescheduleOverdue(items([60, 60, 60]), {
      from,
      dailyBudgetMinutes: 60,
    })
    expect(out.map((r) => r.scheduledDate)).toEqual([
      '2026-06-25',
      '2026-06-26',
      '2026-06-27',
    ])
  })

  it('hard deadline compresses overflow onto the last allowed day', () => {
    // Budget 60, one item per day, but the hard deadline is 06-26: day one 06-25,
    // day two 06-26, and the third can't cross 06-26 so it compresses onto 06-26.
    const out = rescheduleOverdue(items([60, 60, 60]), {
      from,
      dailyBudgetMinutes: 60,
      maxDate: '2026-06-26',
    })
    expect(out.map((r) => r.scheduledDate)).toEqual([
      '2026-06-25',
      '2026-06-26',
      '2026-06-26',
    ])
  })

  it('a hard deadline already in the past collapses everything onto today', () => {
    const out = rescheduleOverdue(items([60, 60]), {
      from,
      dailyBudgetMinutes: 60,
      maxDate: '2026-06-20',
    })
    expect(out.map((r) => r.scheduledDate)).toEqual(['2026-06-25', '2026-06-25'])
  })

  it('a hard deadline on a day off backs up to the previous working day', () => {
    // maxDate Sun 06-28 with weekend off -> last allowed working day is Fri 06-26.
    const out = rescheduleOverdue(items([60, 60, 60]), {
      from,
      dailyBudgetMinutes: 60,
      skipWeekdays: [0, 6],
      maxDate: '2026-06-28',
    })
    expect(out.map((r) => r.scheduledDate)).toEqual([
      '2026-06-25',
      '2026-06-26',
      '2026-06-26',
    ])
  })
})
