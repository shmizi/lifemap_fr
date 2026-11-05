import { describe, it, expect } from 'vitest'
import { format } from 'date-fns'
import {
  scheduleDailyTasks,
  expandRecurringSessions,
  computePlanWindow,
} from '@/engine/ai/scheduleDailyTasks'
import type { AISuggestion } from '@/engine/ai/types'

// Local-time construction so date-fns format() yields the expected day key
// regardless of the machine timezone (scheduledDate is a date-only local key).
const start = new Date(2026, 5, 25) // 2026-06-25

const sessions: AISuggestion[] = [
  { title: 'Day one', description: 'warm up' },
  { title: 'Day two' },
  { title: 'Day three', description: 'review' },
]

describe('scheduleDailyTasks', () => {
  it('lays sessions onto consecutive days from the start date', () => {
    const result = scheduleDailyTasks(sessions, start, 30)
    expect(result.map((t) => t.scheduledDate)).toEqual([
      '2026-06-25',
      '2026-06-26',
      '2026-06-27',
    ])
  })

  it('preserves order and titles', () => {
    const result = scheduleDailyTasks(sessions, start, 30)
    expect(result.map((t) => t.title)).toEqual([
      'Day one',
      'Day two',
      'Day three',
    ])
  })

  it('stamps every task with the same per-day estimate', () => {
    const result = scheduleDailyTasks(sessions, start, 45)
    expect(result.every((t) => t.estimatedMinutes === 45)).toBe(true)
  })

  it('uses each session\'s own minutes when present, defaulting the rest', () => {
    const withMinutes = [
      { title: 'short', minutes: 15 },
      { title: 'no estimate' },
      { title: 'long', minutes: 90 },
    ]
    const result = scheduleDailyTasks(withMinutes, start, 30)
    expect(result.map((t) => t.estimatedMinutes)).toEqual([15, 30, 90])
  })

  it('keeps a description when present and omits it when absent', () => {
    const result = scheduleDailyTasks(sessions, start, 30)
    expect(result[0].description).toBe('warm up')
    expect('description' in result[1]).toBe(false)
  })

  it('returns an empty plan for no sessions', () => {
    expect(scheduleDailyTasks([], start, 30)).toEqual([])
  })

  it('skips days off (start 2026-06-25 is a Thursday; weekend = [0,6])', () => {
    // Thu 06-25, Fri 06-26, then Sat/Sun skipped -> Mon 06-29.
    const result = scheduleDailyTasks(sessions, start, 30, [0, 6])
    expect(result.map((t) => t.scheduledDate)).toEqual([
      '2026-06-25',
      '2026-06-26',
      '2026-06-29',
    ])
  })

  it('ignores a degenerate skip of all seven weekdays (never loops forever)', () => {
    const result = scheduleDailyTasks(sessions, start, 30, [0, 1, 2, 3, 4, 5, 6])
    expect(result.map((t) => t.scheduledDate)).toEqual([
      '2026-06-25',
      '2026-06-26',
      '2026-06-27',
    ])
  })
})

describe('expandRecurringSessions', () => {
  const startThu = new Date(2026, 5, 25) // Thu 2026-06-25

  it('lays a habit at its interval across the window, flagged recurring', () => {
    const out = expandRecurringSessions(
      [{ title: 'Review', minutes: 15, recurrence: { everyDays: 2 } }],
      { startDate: startThu, windowDays: 6, defaultMinutes: 30 },
    )
    expect(out.map((t) => t.scheduledDate)).toEqual([
      '2026-06-25',
      '2026-06-27',
      '2026-06-29',
    ])
    expect(out.every((t) => t.isRecurring)).toBe(true)
    expect(out.every((t) => t.estimatedMinutes === 15)).toBe(true)
  })

  it('ignores one-time (non-recurring) sessions', () => {
    expect(
      expandRecurringSessions([{ title: 'x' }], {
        startDate: startThu,
        windowDays: 7,
        defaultMinutes: 30,
      }),
    ).toEqual([])
  })

  it('defaults minutes when the session carries none', () => {
    const out = expandRecurringSessions(
      [{ title: 'r', recurrence: { everyDays: 7 } }],
      { startDate: startThu, windowDays: 8, defaultMinutes: 40 },
    )
    expect(out[0].estimatedMinutes).toBe(40)
  })

  it('anchors on the first working day and skips rest-day occurrences', () => {
    // Start Sat 06-27 (a day off); weekend off -> anchor Mon 06-29; weekly stays
    // on Monday and never lands on the weekend.
    const startSat = new Date(2026, 5, 27)
    const out = expandRecurringSessions(
      [{ title: 'Weekly', recurrence: { everyDays: 7 } }],
      {
        startDate: startSat,
        windowDays: 14,
        defaultMinutes: 30,
        skipWeekdays: [0, 6],
      },
    )
    expect(out.map((t) => t.scheduledDate)).toEqual(['2026-06-29', '2026-07-06'])
  })
})

describe('computePlanWindow', () => {
  const today = new Date(2026, 5, 25) // 2026-06-25
  const key = (d: Date) => format(d, 'yyyy-MM-dd')

  it('starts today and spans the full horizon with no tasks and no deadline', () => {
    const w = computePlanWindow(today, null, null, 14)
    expect(key(w.startDate)).toBe('2026-06-25')
    expect(w.days).toBe(14)
  })

  it('caps days to the deadline on a first run', () => {
    const w = computePlanWindow(today, null, '2026-07-02', 14)
    expect(key(w.startDate)).toBe('2026-06-25')
    expect(w.days).toBe(7)
  })

  it('extends from the day after the last scheduled task', () => {
    const w = computePlanWindow(today, '2026-06-27', '2026-07-02', 14)
    expect(key(w.startDate)).toBe('2026-06-28')
    expect(w.days).toBe(4)
  })

  it('resumes from today when the last scheduled task is in the past', () => {
    const w = computePlanWindow(today, '2026-06-20', '2026-07-02', 14)
    expect(key(w.startDate)).toBe('2026-06-25')
    expect(w.days).toBe(7)
  })

  it('yields zero days once the plan reaches the deadline', () => {
    const w = computePlanWindow(today, '2026-07-01', '2026-07-02', 14)
    expect(key(w.startDate)).toBe('2026-07-02')
    expect(w.days).toBe(0)
  })

  it('yields zero days when the deadline is already past', () => {
    expect(computePlanWindow(today, null, '2026-06-20', 14).days).toBe(0)
  })
})

// ── Cross-goal capacity ──────────────────────────────────────────────────────
// One session per working day is still the rule; capacity only decides WHICH days
// are eligible, so a new goal's plan slots into days other goals left free.
describe('scheduleDailyTasks — existing calendar load', () => {
  const start = new Date(2026, 7, 10) // Mon 10 Aug 2026, local

  it('skips days already at budget from other goals', () => {
    const out = scheduleDailyTasks(
      [{ title: 'A' }, { title: 'B' }],
      start,
      30,
      [],
      {
        dailyBudgetMinutes: 120,
        committedMinutesByDay: { '2026-08-10': 120, '2026-08-11': 120 },
      },
    )
    expect(out.map((t) => t.scheduledDate)).toEqual(['2026-08-12', '2026-08-13'])
  })

  it('uses a day that still has room left', () => {
    const out = scheduleDailyTasks([{ title: 'A' }], start, 30, [], {
      dailyBudgetMinutes: 120,
      committedMinutesByDay: { '2026-08-10': 90 },
    })
    expect(out[0].scheduledDate).toBe('2026-08-10')
  })

  it('respects days off while skipping full days', () => {
    // Sat(6)/Sun(0) off, and Mon+Tue already full -> first free workday is Wed.
    const out = scheduleDailyTasks([{ title: 'A' }], start, 30, [0, 6], {
      dailyBudgetMinutes: 120,
      committedMinutesByDay: { '2026-08-10': 120, '2026-08-11': 120 },
    })
    expect(out[0].scheduledDate).toBe('2026-08-12')
  })

  it('is unchanged when no capacity is supplied', () => {
    const sessions = [{ title: 'A' }, { title: 'B' }]
    expect(scheduleDailyTasks(sessions, start, 30)).toEqual(
      scheduleDailyTasks(sessions, start, 30, [], {
        dailyBudgetMinutes: 120,
        committedMinutesByDay: {},
      }),
    )
  })
})

describe('capacity: a session must actually fit its day', () => {
  const start = new Date(2026, 7, 10) // Mon 10 Aug 2026, local

  it('skips a part-full day that cannot hold the session', () => {
    const out = scheduleDailyTasks([{ title: 'A', minutes: 60 }], start, 30, [], {
      dailyBudgetMinutes: 240,
      committedMinutesByDay: { '2026-08-10': 200 },
    })
    expect(out[0].scheduledDate).toBe('2026-08-11')
  })

  it('still lands an over-budget session on an empty day', () => {
    const out = scheduleDailyTasks([{ title: 'A', minutes: 300 }], start, 30, [], {
      dailyBudgetMinutes: 240,
      committedMinutesByDay: {},
    })
    expect(out[0].scheduledDate).toBe('2026-08-10')
  })

  it('skips habit occurrences that do not fit, keeping the cadence', () => {
    const out = expandRecurringSessions(
      [{ title: 'H', minutes: 60, recurrence: { everyDays: 1 } }],
      {
        startDate: start,
        windowDays: 3,
        defaultMinutes: 30,
        capacity: {
          dailyBudgetMinutes: 240,
          committedMinutesByDay: { '2026-08-11': 200 },
        },
      },
    )
    expect(out.map((t) => t.scheduledDate)).toEqual(['2026-08-10', '2026-08-12'])
  })

  it('counts habits against each other within one call', () => {
    const habit = (title: string) => ({
      title,
      minutes: 150,
      recurrence: { everyDays: 1 },
    })
    const out = expandRecurringSessions([habit('A'), habit('B')], {
      startDate: start,
      windowDays: 1,
      defaultMinutes: 30,
      capacity: { dailyBudgetMinutes: 240, committedMinutesByDay: {} },
    })
    expect(out.map((t) => t.title)).toEqual(['A'])
  })
})
