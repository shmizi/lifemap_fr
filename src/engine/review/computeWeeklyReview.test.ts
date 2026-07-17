import { describe, expect, it } from 'vitest'
import type { ISODate, Task, TaskStatus } from '@/core/types'
import { computeWeeklyReview } from './computeWeeklyReview'

// Fixed "now" — a mid-day timestamp so local-day reduction is unambiguous in the
// test runner's zone. Window is the rolling 7 days INCLUDING 2026-06-18:
// 2026-06-12 .. 2026-06-18 (today). Today counts for completed/momentum, but
// today's still-open scheduled tasks are NOT "missed".
const NOW = new Date('2026-06-18T12:00:00')

// date-only YYYY-MM-DD at `offset` days from NOW.
function day(offset: number): ISODate {
  const d = new Date(NOW)
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

// A timestamp at midday on the day `offset` from NOW (for completedAt).
function ts(offset: number): ISODate {
  const d = new Date(NOW)
  d.setDate(d.getDate() + offset)
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}

let seq = 0
function makeTask(overrides: Partial<Task> = {}): Task {
  seq += 1
  return {
    id: `task-${seq}`,
    subgoalId: 'subgoal-1',
    title: `Task ${seq}`,
    status: 'pending',
    priority: 'medium',
    isRecurring: false,
    order: 0,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

function completed(overrides: Partial<Task> = {}): Task {
  return makeTask({ status: 'completed' as TaskStatus, ...overrides })
}

describe('computeWeeklyReview', () => {
  it('window is the rolling 7 days including today', () => {
    const r = computeWeeklyReview([], NOW)
    expect(r.windowStart).toBe('2026-06-12') // now - 6
    expect(r.windowEnd).toBe('2026-06-18') // today
    expect(r.dailyMomentum).toHaveLength(7)
    expect(r.dailyMomentum[0].date).toBe('2026-06-12')
    expect(r.dailyMomentum[6].date).toBe('2026-06-18')
  })

  it('an empty week has no completed/missed and all-zero momentum', () => {
    const r = computeWeeklyReview([], NOW)
    expect(r.completedTasks).toEqual([])
    expect(r.missedTasks).toEqual([])
    expect(r.dailyMomentum.every((p) => p.percent === 0)).toBe(true)
  })

  it('counts today as completed, but today is never missed', () => {
    const doneInWindow = completed({ completedAt: ts(-2) }) // 06-16
    const doneToday = completed({ completedAt: ts(0) }) // 06-18 — NOW counted
    const missed = makeTask({ scheduledDate: day(-3) }) // 06-15, past, pending
    const openToday = makeTask({ scheduledDate: day(0) }) // 06-18, open — NOT missed
    const scheduledButDone = completed({
      scheduledDate: day(-3),
      completedAt: ts(-3),
    }) // counts completed, NOT missed

    const r = computeWeeklyReview(
      [doneInWindow, doneToday, missed, openToday, scheduledButDone],
      NOW,
    )

    expect(r.completedTasks.map((t) => t.id).sort()).toEqual(
      [doneInWindow.id, doneToday.id, scheduledButDone.id].sort(),
    )
    expect(r.missedTasks.map((t) => t.id)).toEqual([missed.id])
  })

  it('includes the window boundary days and excludes the days just outside', () => {
    const onStart = makeTask({ scheduledDate: day(-6) }) // 06-12 (windowStart), past
    const onLastPast = makeTask({ scheduledDate: day(-1) }) // 06-17 (yesterday), past
    const beforeStart = makeTask({ scheduledDate: day(-7) }) // 06-11, out
    const today = makeTask({ scheduledDate: day(0) }) // 06-18, open — not missed

    const completedOnStart = completed({ completedAt: ts(-6) }) // 06-12, in
    const completedToday = completed({ completedAt: ts(0) }) // 06-18, in
    const completedBeforeStart = completed({ completedAt: ts(-7) }) // 06-11, out

    const r = computeWeeklyReview(
      [
        onStart,
        onLastPast,
        beforeStart,
        today,
        completedOnStart,
        completedToday,
        completedBeforeStart,
      ],
      NOW,
    )

    expect(r.missedTasks.map((t) => t.id).sort()).toEqual(
      [onStart.id, onLastPast.id].sort(),
    )
    expect(r.completedTasks.map((t) => t.id).sort()).toEqual(
      [completedOnStart.id, completedToday.id].sort(),
    )
  })

  it('all-completed week: every scheduled task done, none missed', () => {
    const tasks = [
      completed({ scheduledDate: day(-2), completedAt: ts(-2) }),
      completed({ scheduledDate: day(-4), completedAt: ts(-4) }),
    ]
    const r = computeWeeklyReview(tasks, NOW)
    expect(r.completedTasks).toHaveLength(2)
    expect(r.missedTasks).toEqual([])
    // Each of those two days hit 100% effort momentum.
    expect(r.dailyMomentum.find((p) => p.date === day(-2))?.percent).toBe(100)
    expect(r.dailyMomentum.find((p) => p.date === day(-4))?.percent).toBe(100)
  })

  it('all-missed week: scheduled-and-open across the window, 0% each day', () => {
    const tasks = [
      makeTask({ scheduledDate: day(-2) }),
      makeTask({ scheduledDate: day(-5) }),
    ]
    const r = computeWeeklyReview(tasks, NOW)
    expect(r.completedTasks).toEqual([])
    expect(r.missedTasks).toHaveLength(2)
    expect(r.dailyMomentum.find((p) => p.date === day(-2))?.percent).toBe(0)
  })
})
