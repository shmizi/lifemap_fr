import { describe, expect, it } from 'vitest'
import type { EffortSize, Task, TaskStatus } from '@/core/types'
import { computeEffortMomentum } from './computeEffortMomentum'

// Pure engine test — only status and effort matter; the rest is filler so the
// object satisfies Task. Weights under test: XS1 S2 M3 L5 XL8; unset -> M(3).
function makeTask(status: TaskStatus, effort?: EffortSize): Task {
  return {
    id: `task-${Math.random()}`,
    subgoalId: 'subgoal-1',
    title: 'A task',
    status,
    priority: 'medium',
    ...(effort ? { effort } : {}),
    isRecurring: false,
    order: 0,
    createdAt: '2026-06-18',
    updatedAt: '2026-06-18',
  }
}

describe('computeEffortMomentum', () => {
  it('an empty day is 0 of 0 at 0% (no divide-by-zero)', () => {
    expect(computeEffortMomentum([])).toEqual({
      completed: 0,
      total: 0,
      percent: 0,
    })
  })

  it('sums effort weights, not task counts', () => {
    // total = L(5) + XS(1) + XL(8) = 14; completed = L(5) = 5; 5/14 = 36%.
    const tasks = [
      makeTask('completed', 'L'),
      makeTask('pending', 'XS'),
      makeTask('pending', 'XL'),
    ]
    expect(computeEffortMomentum(tasks)).toEqual({
      completed: 5,
      total: 14,
      percent: 36,
    })
  })

  it('weights a big completed task above several small open ones', () => {
    // One XL(8) done vs three XS(1) open: completed 8 / total 11 = 73%.
    const tasks = [
      makeTask('completed', 'XL'),
      makeTask('pending', 'XS'),
      makeTask('pending', 'XS'),
      makeTask('pending', 'XS'),
    ]
    expect(computeEffortMomentum(tasks).percent).toBe(73)
  })

  it('treats a task with no effort as medium weight (3), not zero', () => {
    // unset + unset, one done: completed 3 / total 6 = 50%.
    const tasks = [makeTask('completed'), makeTask('pending')]
    expect(computeEffortMomentum(tasks)).toEqual({
      completed: 3,
      total: 6,
      percent: 50,
    })
  })

  it('all completed is 100% regardless of sizes', () => {
    const tasks = [makeTask('completed', 'XS'), makeTask('completed', 'XL')]
    expect(computeEffortMomentum(tasks).percent).toBe(100)
  })
})
