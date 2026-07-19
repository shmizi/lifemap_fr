import { describe, expect, it } from 'vitest'
import type {
  GoalTree,
  Milestone,
  Subgoal,
  Task,
} from '@/core/types'
import { resolveScopeCutTarget } from './resolveScopeCutTarget'

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

function makeSubgoal(id: string, title: string): Subgoal {
  return {
    id,
    goalId: 'goal-1',
    title,
    description: '',
    status: 'not_started',
    requiresConsistency: true,
    order: 0,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  }
}

function makeMilestone(id: string, subgoalId: string, title: string): Milestone {
  return {
    id,
    subgoalId,
    title,
    status: 'active',
    order: 0,
    aiSuggested: false,
    createdAt: '2026-06-01T00:00:00.000Z',
  }
}

// A goal with two tracks; the first has a phase carrying a mix of done/open tasks.
function makeTree(): GoalTree {
  return {
    goal: {
      id: 'goal-1',
      title: 'Learn German',
      description: '',
      category: 'education',
      targetDate: '2026-12-01',
      status: 'active',
      priority: 'medium',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
    subgoals: [
      {
        subgoal: makeSubgoal('sg-core', 'Core grammar'),
        looseTasks: [makeTask({ subgoalId: 'sg-core', title: 'loose', status: 'completed' })],
        milestones: [
          {
            milestone: makeMilestone('ms-basics', 'sg-core', 'Master the basics'),
            tasks: [
              makeTask({ subgoalId: 'sg-core', title: 'a', status: 'completed' }),
              makeTask({ subgoalId: 'sg-core', title: 'b', status: 'pending' }),
              makeTask({ subgoalId: 'sg-core', title: 'c', status: 'pending' }),
            ],
          },
        ],
      },
      {
        subgoal: makeSubgoal('sg-advanced', 'Advanced Topics'),
        looseTasks: [],
        milestones: [
          {
            milestone: makeMilestone('ms-idioms', 'sg-advanced', 'Idioms and slang'),
            tasks: [makeTask({ subgoalId: 'sg-advanced', title: 'd', status: 'pending' })],
          },
        ],
      },
    ],
  }
}

describe('resolveScopeCutTarget', () => {
  it('matches a track by exact title', () => {
    const match = resolveScopeCutTarget(makeTree(), 'Advanced Topics')
    expect(match?.kind).toBe('subgoal')
    expect(match?.id).toBe('sg-advanced')
  })

  it('matches a phase by exact title', () => {
    const match = resolveScopeCutTarget(makeTree(), 'Idioms and slang')
    expect(match?.kind).toBe('milestone')
    expect(match?.id).toBe('ms-idioms')
  })

  it('matches when the model wraps the title in prose', () => {
    const match = resolveScopeCutTarget(makeTree(), 'defer the Advanced Topics track for now')
    expect(match?.id).toBe('sg-advanced')
  })

  it('collects all task ids and the incomplete subset for a track', () => {
    // sg-core spans its loose task (done) + the phase's 3 tasks (1 done, 2 open).
    const match = resolveScopeCutTarget(makeTree(), 'Core grammar')
    expect(match?.kind).toBe('subgoal')
    expect(match?.taskIds).toHaveLength(4)
    expect(match?.incompleteTaskIds).toHaveLength(2)
  })

  it('scopes a phase match to only its own tasks', () => {
    const match = resolveScopeCutTarget(makeTree(), 'Master the basics')
    expect(match?.kind).toBe('milestone')
    expect(match?.taskIds).toHaveLength(3)
    expect(match?.incompleteTaskIds).toHaveLength(2)
  })

  it('returns null when nothing matches', () => {
    expect(resolveScopeCutTarget(makeTree(), 'a track that does not exist')).toBeNull()
  })

  it('returns null on an empty / whitespace target', () => {
    expect(resolveScopeCutTarget(makeTree(), '   ')).toBeNull()
  })

  it('ignores punctuation and case differences', () => {
    const match = resolveScopeCutTarget(makeTree(), 'advanced topics!!')
    expect(match?.id).toBe('sg-advanced')
  })
})
