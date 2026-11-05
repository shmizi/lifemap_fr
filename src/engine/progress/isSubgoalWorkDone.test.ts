import { describe, it, expect } from 'vitest'
import type { MilestoneStatus, SubgoalTree, Task, TaskStatus } from '@/core/types'
import { isSubgoalWorkDone } from './isSubgoalWorkDone'

const task = (status: TaskStatus, id = 't'): Task => ({
  id,
  subgoalId: 's',
  title: id,
  status,
  priority: 'medium',
  isRecurring: false,
  order: 0,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
})

const tree = (over: {
  looseTasks?: Task[]
  milestones?: Array<{ status: MilestoneStatus; tasks: Task[] }>
}): SubgoalTree => ({
  subgoal: {
    id: 's',
    goalId: 'g',
    title: 'Track',
    description: '',
    status: 'active',
    requiresConsistency: false,
    order: 0,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
  looseTasks: over.looseTasks ?? [],
  milestones: (over.milestones ?? []).map((m, i) => ({
    milestone: {
      id: `m${i}`,
      subgoalId: 's',
      title: `Phase ${i}`,
      status: m.status,
      order: i,
      aiSuggested: false,
      createdAt: '2026-01-01',
    },
    tasks: m.tasks,
  })),
})

describe('isSubgoalWorkDone', () => {
  it('is true when every loose task is complete', () => {
    expect(
      isSubgoalWorkDone(
        tree({ looseTasks: [task('completed', 'a'), task('completed', 'b')] }),
      ),
    ).toBe(true)
  })

  it('is false while any task is open', () => {
    expect(
      isSubgoalWorkDone(
        tree({ looseTasks: [task('completed', 'a'), task('pending', 'b')] }),
      ),
    ).toBe(false)
  })

  it('counts tasks inside phases, not just loose ones', () => {
    expect(
      isSubgoalWorkDone(
        tree({
          milestones: [{ status: 'completed', tasks: [task('completed', 'a')] }],
        }),
      ),
    ).toBe(true)
    expect(
      isSubgoalWorkDone(
        tree({
          milestones: [{ status: 'active', tasks: [task('pending', 'a')] }],
        }),
      ),
    ).toBe(false)
  })

  it('is false when a phase is still open even though its tasks are done', () => {
    // A phase can lag its tasks (status is reconciled separately), and the subgoal
    // should not read as finished while the structure says otherwise.
    expect(
      isSubgoalWorkDone(
        tree({
          milestones: [{ status: 'active', tasks: [task('completed', 'a')] }],
        }),
      ),
    ).toBe(false)
  })

  it('is FALSE for a subgoal with no work — nothing is finished', () => {
    expect(isSubgoalWorkDone(tree({}))).toBe(false)
  })

  it('is FALSE for a subgoal holding only empty phases', () => {
    // Empty phases are unplanned work, not finished work — the vacuous-every trap.
    expect(
      isSubgoalWorkDone(tree({ milestones: [{ status: 'active', tasks: [] }] })),
    ).toBe(false)
  })

  it('treats a skipped task as not complete', () => {
    expect(isSubgoalWorkDone(tree({ looseTasks: [task('skipped', 'a')] }))).toBe(
      false,
    )
  })
})
