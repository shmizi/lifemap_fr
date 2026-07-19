import { describe, expect, it } from 'vitest'
import type {
  Goal,
  GoalTree,
  ISODate,
  Milestone,
  MilestoneStatus,
  MilestoneTree,
  Subgoal,
  SubgoalTree,
  Task,
} from '@/core/types'
import {
  computeRoadmapDigest,
  renderDigestLines,
  DIGEST_WINDOW_DAYS,
} from './computeRoadmapDigest'

const NOW = new Date('2026-06-18T12:00:00')

// date-only YYYY-MM-DD at `offset` days from NOW.
function day(offset: number): ISODate {
  const d = new Date(NOW)
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}
function ts(offset: number): ISODate {
  const d = new Date(NOW)
  d.setDate(d.getDate() + offset)
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}

let seq = 0
function makeTask(overrides: Partial<Task> = {}): Task {
  seq += 1
  return {
    id: `task-${seq}`,
    subgoalId: 'sg-1',
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

function makeMilestone(
  id: string,
  order: number,
  status: MilestoneStatus,
): Milestone {
  return {
    id,
    subgoalId: 'sg-1',
    title: `M-${id}`,
    status,
    order,
    aiSuggested: true,
    createdAt: '2026-06-01T00:00:00.000Z',
  }
}

function phase(
  id: string,
  order: number,
  status: MilestoneStatus,
  tasks: Task[],
): MilestoneTree {
  return { milestone: makeMilestone(id, order, status), tasks }
}

function makeSubgoal(id: string, title: string): Subgoal {
  return {
    id,
    goalId: 'goal-1',
    title,
    description: '',
    status: 'active',
    requiresConsistency: true,
    order: 0,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  }
}

function track(
  id: string,
  title: string,
  milestones: MilestoneTree[],
  looseTasks: Task[] = [],
): SubgoalTree {
  return { subgoal: makeSubgoal(id, title), milestones, looseTasks }
}

function makeTree(subgoals: SubgoalTree[]): GoalTree {
  const goal: Goal = {
    id: 'goal-1',
    title: 'Become a data analyst',
    description: '',
    category: 'career',
    priority: 'high',
    targetDate: '2027-01-01',
    status: 'active',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  }
  return { goal, subgoals }
}

describe('computeRoadmapDigest', () => {
  it('summarises the structure as titles + per-phase done/taskCount', () => {
    const tree = makeTree([
      track('sg-1', 'Foundations', [
        phase('a', 0, 'completed', [makeTask({ status: 'completed' })]),
        phase('b', 1, 'active', [makeTask(), makeTask()]),
      ]),
    ])
    const d = computeRoadmapDigest(tree, NOW)
    expect(d.goalTitle).toBe('Become a data analyst')
    expect(d.tracks).toHaveLength(1)
    expect(d.tracks[0].phases).toEqual([
      { title: 'M-a', done: true, taskCount: 1 },
      { title: 'M-b', done: false, taskCount: 2 },
    ])
  })

  it('points currentPhase at the first not-done phase (or null when all done)', () => {
    const tree = makeTree([
      track('sg-1', 'T1', [
        phase('a', 0, 'completed', []),
        phase('b', 1, 'active', []),
      ]),
      track('sg-2', 'T2', [phase('c', 0, 'completed', [])]),
    ])
    const d = computeRoadmapDigest(tree, NOW)
    expect(d.tracks[0].currentPhase).toBe('M-b')
    expect(d.tracks[1].currentPhase).toBeNull()
  })

  it('orders phases by milestone order regardless of input order', () => {
    const tree = makeTree([
      track('sg-1', 'T1', [
        phase('late', 2, 'active', []),
        phase('early', 0, 'active', []),
        phase('mid', 1, 'active', []),
      ]),
    ])
    const d = computeRoadmapDigest(tree, NOW)
    expect(d.tracks[0].phases.map((p) => p.title)).toEqual([
      'M-early',
      'M-mid',
      'M-late',
    ])
    // currentPhase respects order too — the earliest not-done phase.
    expect(d.tracks[0].currentPhase).toBe('M-early')
  })

  it('rolls up recent completed/missed as bounded counts over a 2-week window', () => {
    const tree = makeTree([
      track('sg-1', 'T1', [
        phase('a', 0, 'active', [
          makeTask({ status: 'completed', completedAt: ts(-3) }), // completed in window
          makeTask({ status: 'pending', scheduledDate: day(-2) }), // missed (past, open)
          makeTask({ status: 'pending', scheduledDate: day(0) }), // today, NOT missed
          makeTask({ status: 'completed', completedAt: ts(-30) }), // outside window
        ]),
      ],
      [makeTask({ status: 'pending', scheduledDate: day(-1) })]), // loose, missed
    ])
    const d = computeRoadmapDigest(tree, NOW)
    expect(d.recent.windowEnd).toBe('2026-06-18')
    expect(d.recent.windowStart).toBe(day(-(DIGEST_WINDOW_DAYS - 1)))
    expect(d.recent.completed).toBe(1)
    expect(d.recent.missed).toBe(2)
  })

  it('handles a goal with no structure', () => {
    const d = computeRoadmapDigest(makeTree([]), NOW)
    expect(d.tracks).toEqual([])
    expect(d.recent.completed).toBe(0)
    expect(d.recent.missed).toBe(0)
  })
})

describe('renderDigestLines', () => {
  it('renders compact, bounded prompt lines', () => {
    const tree = makeTree([
      track('sg-1', 'Foundations', [
        phase('a', 0, 'completed', [makeTask({ status: 'completed' })]),
        phase('b', 1, 'active', [makeTask()]),
      ]),
    ])
    const lines = renderDigestLines(computeRoadmapDigest(tree, NOW))
    const text = lines.join('\n')
    expect(text).toContain('Foundations')
    expect(text).toContain('✓ M-a')
    expect(text).toContain('currently on: M-b')
    expect(text).toContain('Last 2 weeks')
  })
})
