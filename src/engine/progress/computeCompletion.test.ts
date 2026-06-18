import { describe, expect, it } from 'vitest'
import type { Task, TaskStatus } from '@/core/types'
import { computeCompletion } from './computeCompletion'

// Pure engine test — no DB, no fake-indexeddb, no timers. Only `status` varies
// per case; the rest is filler so the object satisfies Task. This is the single
// home for the completion-math cases the domain wrappers used to each duplicate.
function makeTask(status: TaskStatus): Task {
  return {
    id: `task-${status}-${Math.random()}`,
    subgoalId: 'subgoal-1',
    title: 'A task',
    status,
    priority: 'medium',
    isRecurring: false,
    order: 0,
    createdAt: '2026-06-18',
    updatedAt: '2026-06-18',
  }
}

describe('computeCompletion', () => {
  it('an empty set is 0 of 0 at 0% (no divide-by-zero)', () => {
    expect(computeCompletion([])).toEqual({ completed: 0, total: 0, percent: 0 })
  })

  it('all tasks completed is 100%', () => {
    const tasks = [makeTask('completed'), makeTask('completed')]
    expect(computeCompletion(tasks)).toEqual({
      completed: 2,
      total: 2,
      percent: 100,
    })
  })

  it('counts only completed tasks, ignoring pending/in_progress/skipped', () => {
    const tasks = [
      makeTask('completed'),
      makeTask('pending'),
      makeTask('in_progress'),
      makeTask('skipped'),
    ]
    expect(computeCompletion(tasks)).toEqual({
      completed: 1,
      total: 4,
      percent: 25,
    })
  })

  it('rounds the percent to a whole number', () => {
    // 1 of 3 = 33.33% -> 33.
    const tasks = [makeTask('completed'), makeTask('pending'), makeTask('pending')]
    expect(computeCompletion(tasks).percent).toBe(33)
    // 2 of 3 = 66.66% -> 67.
    const more = [makeTask('completed'), makeTask('completed'), makeTask('pending')]
    expect(computeCompletion(more).percent).toBe(67)
  })
})
