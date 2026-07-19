import { describe, expect, it } from 'vitest'
import type { Task } from '@/core/types'
import { partitionScheduledAndBacklog } from './partitionTasks'

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

describe('partitionScheduledAndBacklog', () => {
  it('routes an open, undated task to the backlog', () => {
    const { scheduled, backlog } = partitionScheduledAndBacklog([
      makeTask({ scheduledDate: undefined, status: 'pending' }),
    ])
    expect(backlog).toHaveLength(1)
    expect(scheduled).toHaveLength(0)
  })

  it('routes a dated task to scheduled', () => {
    const { scheduled, backlog } = partitionScheduledAndBacklog([
      makeTask({ scheduledDate: '2026-07-20' }),
    ])
    expect(scheduled).toHaveLength(1)
    expect(backlog).toHaveLength(0)
  })

  it('keeps a completed undated task with scheduled, not the backlog', () => {
    // A finished someday-task is done work, not "later" — it must not read as
    // outstanding backlog.
    const { scheduled, backlog } = partitionScheduledAndBacklog([
      makeTask({ scheduledDate: undefined, status: 'completed' }),
    ])
    expect(scheduled).toHaveLength(1)
    expect(backlog).toHaveLength(0)
  })

  it('splits a mixed set and preserves order within each group', () => {
    const dated = makeTask({ scheduledDate: '2026-07-10', title: 'Dated' })
    const later1 = makeTask({ scheduledDate: undefined, title: 'Later 1' })
    const done = makeTask({ scheduledDate: undefined, status: 'completed', title: 'Done' })
    const later2 = makeTask({ scheduledDate: undefined, title: 'Later 2' })
    const { scheduled, backlog } = partitionScheduledAndBacklog([
      dated,
      later1,
      done,
      later2,
    ])
    expect(scheduled.map((t) => t.title)).toEqual(['Dated', 'Done'])
    expect(backlog.map((t) => t.title)).toEqual(['Later 1', 'Later 2'])
  })

  it('handles an empty list', () => {
    const { scheduled, backlog } = partitionScheduledAndBacklog([])
    expect(scheduled).toEqual([])
    expect(backlog).toEqual([])
  })
})
