import { describe, expect, it } from 'vitest'
import type { ISODate, Task, TaskStatus } from '@/core/types'
import { computeWeeklyReview } from './computeWeeklyReview'

// Fixed "now" — a mid-day timestamp so local-day reduction is unambiguous in the
// test runner's zone. Window is the 7 days before 2026-06-18: 2026-06-11 ..
// 2026-06-17 (today, the 18th, is excluded).
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
  it('window is the 7 days before today, ending yesterday', () => {
    const r = computeWeeklyReview([], NOW)
    expect(r.windowStart).toBe('2026-06-11') // now - 7
    expect(r.windowEnd).toBe('2026-06-17') // now - 1 (yesterday)
    expect(r.dailyMomentum).toHaveLength(7)
    expect(r.dailyMomentum[0].date).toBe('2026-06-11')
    expect(r.dailyMomentum[6].date).toBe('2026-06-17')
  })

  it('an empty week has no completed/missed and all-zero momentum', () => {
    const r = computeWeeklyReview([], NOW)
    expect(r.completedTasks).toEqual([])
    expect(r.missedTasks).toEqual([])
    expect(r.dailyMomentum.every((p) => p.percent === 0)).toBe(true)
  })

  it('counts completed by completedAt-in-window, missed by scheduled-and-open', () => {
    const doneInWindow = completed({ completedAt: ts(-2) }) // 06-16
    const doneToday = completed({ completedAt: ts(0) }) // excluded (today)
    const missed = makeTask({ scheduledDate: day(-3) }) // 06-15, pending
    const scheduledButDone = completed({
      scheduledDate: day(-3),
      completedAt: ts(-3),
    }) // counts completed, NOT missed

    const r = computeWeeklyReview(
      [doneInWindow, doneToday, missed, scheduledButDone],
      NOW,
    )

    expect(r.completedTasks.map((t) => t.id).sort()).toEqual(
      [doneInWindow.id, scheduledButDone.id].sort(),
    )
    expect(r.missedTasks.map((t) => t.id)).toEqual([missed.id])
  })

  it('includes the window boundary days and excludes the days just outside', () => {
    const onStart = makeTask({ scheduledDate: day(-7) }) // 06-11 (windowStart)
    const onEnd = makeTask({ scheduledDate: day(-1) }) // 06-17 (windowEnd)
    const beforeStart = makeTask({ scheduledDate: day(-8) }) // 06-10, out
    const today = makeTask({ scheduledDate: day(0) }) // 06-18, out

    const completedOnStart = completed({ completedAt: ts(-7) })
    const completedBeforeStart = completed({ completedAt: ts(-8) }) // out

    const r = computeWeeklyReview(
      [onStart, onEnd, beforeStart, today, completedOnStart, completedBeforeStart],
      NOW,
    )

    expect(r.missedTasks.map((t) => t.id).sort()).toEqual(
      [onStart.id, onEnd.id].sort(),
    )
    expect(r.completedTasks.map((t) => t.id)).toEqual([completedOnStart.id])
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
