import { describe, expect, it } from 'vitest'
import type { Task, TaskStatus } from '@/core/types'
import { computeGoalProgress } from './computeGoalProgress'

// Pure engine test — no DB, no fake-indexeddb, no timers. Only `status` varies
// per case; the rest is filler so the object satisfies Task.
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

describe('computeGoalProgress', () => {
  it('a goal with no tasks is 0 of 0 at 0% (no divide-by-zero)', () => {
    expect(computeGoalProgress([])).toEqual({
      completed: 0,
      total: 0,
      percent: 0,
    })
  })

  it('all tasks completed is 100%', () => {
    const tasks = [makeTask('completed'), makeTask('completed')]
    expect(computeGoalProgress(tasks)).toEqual({
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
    // 1 of 4 done.
    expect(computeGoalProgress(tasks)).toEqual({
      completed: 1,
      total: 4,
      percent: 25,
    })
  })

  it('rounds the percent to a whole number', () => {
    // 2 of 3 = 66.66% -> 67.
    const tasks = [makeTask('completed'), makeTask('completed'), makeTask('pending')]
    expect(computeGoalProgress(tasks).percent).toBe(67)
  })
})
