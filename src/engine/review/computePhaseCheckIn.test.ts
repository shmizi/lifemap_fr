import { describe, expect, it } from 'vitest'
import type { Milestone, MilestoneTree, Task } from '@/core/types'
import { computePhaseCheckIn } from './computePhaseCheckIn'

let seq = 0
function makeTask(overrides: Partial<Task> = {}): Task {
  seq += 1
  return {
    id: `task-${seq}`,
    subgoalId: 'subgoal-1',
    milestoneId: 'milestone-1',
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

function makeMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: 'milestone-1',
    subgoalId: 'subgoal-1',
    title: 'Master the dative case',
    status: 'active',
    order: 0,
    aiSuggested: true,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

// A MilestoneTree (a phase) with the given tasks.
function makePhase(
  tasks: Task[],
  milestoneOverrides: Partial<Milestone> = {},
): MilestoneTree {
  return { milestone: makeMilestone(milestoneOverrides), tasks }
}

describe('computePhaseCheckIn', () => {
  it('an empty phase is not complete and has an empty recap', () => {
    const r = computePhaseCheckIn(makePhase([]))
    expect(r.phaseComplete).toBe(false)
    expect(r.totalTasks).toBe(0)
    expect(r.completedTasks).toEqual([])
    expect(r.outstandingTasks).toEqual([])
    expect(r.spanStart).toBeNull()
    expect(r.spanEnd).toBeNull()
    expect(r.completion.percent).toBe(0)
  })

  it('is complete when every task is done', () => {
    const r = computePhaseCheckIn(
      makePhase([
        makeTask({ status: 'completed' }),
        makeTask({ status: 'completed' }),
      ]),
    )
    expect(r.phaseComplete).toBe(true)
    expect(r.totalTasks).toBe(2)
    expect(r.completedTasks).toHaveLength(2)
    expect(r.outstandingTasks).toHaveLength(0)
    expect(r.completion.percent).toBe(100)
  })

  it('is NOT complete while a task is still open, and lists what is left', () => {
    const open = makeTask({ status: 'pending', title: 'Unfinished' })
    const r = computePhaseCheckIn(
      makePhase([makeTask({ status: 'completed' }), open]),
    )
    expect(r.phaseComplete).toBe(false)
    expect(r.outstandingTasks).toHaveLength(1)
    expect(r.outstandingTasks[0].title).toBe('Unfinished')
  })

  it('honors an explicitly completed milestone even with a stray open task', () => {
    const r = computePhaseCheckIn(
      makePhase([makeTask({ status: 'pending' })], { status: 'completed' }),
    )
    expect(r.phaseComplete).toBe(true)
    expect(r.outstandingTasks).toHaveLength(1)
  })

  it('spans from the earliest to the latest dated signal', () => {
    // scheduledDate and completedAt both feed the span; completedAt is reduced to
    // its local day. Earliest here is the 10th (scheduled), latest the 20th (done).
    const r = computePhaseCheckIn(
      makePhase([
        makeTask({
          status: 'completed',
          scheduledDate: '2026-06-12',
          completedAt: '2026-06-20T12:00:00',
        }),
        makeTask({ status: 'pending', scheduledDate: '2026-06-10' }),
      ]),
    )
    expect(r.spanStart).toBe('2026-06-10')
    expect(r.spanEnd).toBe('2026-06-20')
  })

  it('effort-weights the recap rather than counting tasks', () => {
    // One XL completed task vs one XS open task: by task count that is 50%, but
    // effort weighting makes the completed share larger (XL > XS).
    const r = computePhaseCheckIn(
      makePhase([
        makeTask({ status: 'completed', effort: 'XL' }),
        makeTask({ status: 'pending', effort: 'XS' }),
      ]),
    )
    expect(r.completion.percent).toBeGreaterThan(50)
  })

  it('carries the milestone title as the phase title', () => {
    const r = computePhaseCheckIn(
      makePhase([], { title: 'Reach A2 vocabulary' }),
    )
    expect(r.phaseTitle).toBe('Reach A2 vocabulary')
  })
})
