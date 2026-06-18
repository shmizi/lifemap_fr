import { describe, expect, it } from 'vitest'
import type { Task } from '@/core/types'
import { computeTodayProgress } from './computeTodayProgress'

// The completion math is covered thoroughly in computeCompletion.test.ts. This
// only confirms the domain alias is wired to it and returns the shared shape.
function makeTask(): Task {
  return {
    id: `task-${Math.random()}`,
    subgoalId: 'subgoal-1',
    title: 'A task',
    status: 'completed',
    priority: 'medium',
    isRecurring: false,
    order: 0,
    createdAt: '2026-06-18',
    updatedAt: '2026-06-18',
  }
}

describe('computeTodayProgress', () => {
  it('delegates to computeCompletion', () => {
    expect(computeTodayProgress([])).toEqual({ completed: 0, total: 0, percent: 0 })
    expect(computeTodayProgress([makeTask()])).toEqual({
      completed: 1,
      total: 1,
      percent: 100,
    })
  })
})
