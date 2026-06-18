import { describe, expect, it } from 'vitest'
import type { Task, TaskStatus } from '@/core/types'
import { isMilestoneComplete } from './isMilestoneComplete'

// Pure engine test — only `status` matters; the rest is filler so the object
// satisfies Task.
function makeTask(status: TaskStatus): Task {
  return {
    id: `task-${status}-${Math.random()}`,
    subgoalId: 'subgoal-1',
    milestoneId: 'milestone-1',
    title: 'A task',
    status,
    priority: 'medium',
    isRecurring: false,
    order: 0,
    createdAt: '2026-06-18',
    updatedAt: '2026-06-18',
  }
}

describe('isMilestoneComplete', () => {
  it('an empty milestone is NOT complete (nothing to finish)', () => {
    // Guards against `[].every(...)` being vacuously true.
    expect(isMilestoneComplete([])).toBe(false)
  })

  it('is complete when every task is completed', () => {
    expect(
      isMilestoneComplete([makeTask('completed'), makeTask('completed')]),
    ).toBe(true)
  })

  it('is not complete while any task is unfinished', () => {
    expect(
      isMilestoneComplete([makeTask('completed'), makeTask('pending')]),
    ).toBe(false)
  })

  it('treats in_progress and skipped as not completed', () => {
    expect(isMilestoneComplete([makeTask('in_progress')])).toBe(false)
    expect(isMilestoneComplete([makeTask('skipped')])).toBe(false)
  })
})
