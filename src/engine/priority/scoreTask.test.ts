import { describe, expect, it } from 'vitest'
import type { ISODate, Priority, Task } from '@/core/types'
import { scoreTask } from './scoreTask'

// A fixed "now" so every case is deterministic (no real clock).
const NOW = new Date('2026-06-18T12:00:00.000Z')

// Minimal valid Task; tests override only the fields scoreTask reads.
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Math.random()}`,
    subgoalId: 'subgoal-1',
    title: 'A task',
    status: 'pending',
    priority: 'medium',
    isRecurring: false,
    order: 0,
    createdAt: '2026-06-18',
    updatedAt: '2026-06-18',
    ...overrides,
  }
}

// date-only YYYY-MM-DD relative to NOW.
function day(offset: number): ISODate {
  const d = new Date(NOW)
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

describe('scoreTask', () => {
  it('higher priority scores higher, all else equal', () => {
    const priorities: Priority[] = ['low', 'medium', 'high', 'critical']
    const scores = priorities.map((priority) =>
      scoreTask(makeTask({ priority }), NOW),
    )
    // Strictly increasing low -> critical.
    expect(scores[0]).toBeLessThan(scores[1])
    expect(scores[1]).toBeLessThan(scores[2])
    expect(scores[2]).toBeLessThan(scores[3])
  })

  it('an overdue task scores higher than one not yet due, all else equal', () => {
    const overdue = scoreTask(makeTask({ dueDate: day(-1) }), NOW)
    const dueToday = scoreTask(makeTask({ dueDate: day(0) }), NOW)
    const dueSoon = scoreTask(makeTask({ dueDate: day(2) }), NOW)
    const dueLater = scoreTask(makeTask({ dueDate: day(30) }), NOW)
    expect(overdue).toBeGreaterThan(dueToday)
    expect(dueToday).toBeGreaterThan(dueSoon)
    expect(dueSoon).toBeGreaterThan(dueLater)
  })

  it('a task with no due date and no schedule scores on priority alone', () => {
    // medium priority, nothing time-sensitive.
    expect(scoreTask(makeTask({ priority: 'medium' }), NOW)).toBe(
      scoreTask(makeTask({ priority: 'medium' }), NOW),
    )
    // low priority with nothing else is the floor: 0.
    expect(scoreTask(makeTask({ priority: 'low' }), NOW)).toBe(0)
  })

  it('a scheduledDate that has arrived adds a nudge', () => {
    const scheduledToday = scoreTask(makeTask({ scheduledDate: day(0) }), NOW)
    const unscheduled = scoreTask(makeTask(), NOW)
    expect(scheduledToday).toBeGreaterThan(unscheduled)
  })

  it('a far-future due date adds nothing beyond priority', () => {
    const far = scoreTask(makeTask({ priority: 'high', dueDate: day(60) }), NOW)
    const none = scoreTask(makeTask({ priority: 'high' }), NOW)
    expect(far).toBe(none)
  })
})
