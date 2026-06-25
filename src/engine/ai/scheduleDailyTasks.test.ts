import { describe, it, expect } from 'vitest'
import { format } from 'date-fns'
import {
  scheduleDailyTasks,
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

  it('keeps a description when present and omits it when absent', () => {
    const result = scheduleDailyTasks(sessions, start, 30)
    expect(result[0].description).toBe('warm up')
    expect('description' in result[1]).toBe(false)
  })

  it('returns an empty plan for no sessions', () => {
    expect(scheduleDailyTasks([], start, 30)).toEqual([])
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
