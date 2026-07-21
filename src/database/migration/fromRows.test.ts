import { describe, it, expect } from 'vitest'
import type {
  Goal,
  Subgoal,
  Milestone,
  Task,
  Dependency,
  GoalContext,
  UserProfile,
  UserContext,
  ProgressSnapshot,
  Opportunity,
  SlipEvent,
} from '@/core/types'
import {
  goalToRow,
  subgoalToRow,
  milestoneToRow,
  taskToRow,
  dependencyToRow,
  goalContextToRow,
  userProfileToRow,
  userContextToRow,
  snapshotToRow,
  opportunityToRow,
  slipEventToRow,
} from '@/database/migration/toRows'
import {
  goalFromRow,
  subgoalFromRow,
  milestoneFromRow,
  taskFromRow,
  dependencyFromRow,
  goalContextFromRow,
  userProfileFromRow,
  userContextFromRow,
  snapshotFromRow,
  opportunityFromRow,
  slipEventFromRow,
} from '@/database/migration/fromRows'

// The core contract of the read half of the port: a domain object written up with
// toRows and read back with fromRows must be UNCHANGED. Fixtures populate every
// optional so the round-trip is an exact structural equality (the null↔undefined and
// default coercions for ABSENT optionals are covered separately below). The single-
// row tables (profile / user context) drop their id in toRows and have it restored
// here, so they use the 'me' sentinel to round-trip cleanly.
describe('fromRows round-trips toRows', () => {
  it('goal', () => {
    const goal: Goal = {
      id: 'g1',
      title: 'Run a half marathon',
      description: 'road race',
      category: 'health',
      targetDate: '2026-11-30',
      status: 'active',
      priority: 'high',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    expect(goalFromRow(goalToRow(goal))).toEqual(goal)
  })

  it('subgoal (all optionals present)', () => {
    const subgoal: Subgoal = {
      id: 's1',
      goalId: 'g1',
      title: 'Base building',
      description: 'easy miles',
      targetDate: '2026-08-01',
      status: 'active',
      requiresConsistency: true,
      estimatedDailyMinutes: 40,
      order: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    expect(subgoalFromRow(subgoalToRow(subgoal))).toEqual(subgoal)
  })

  it('milestone (all optionals present)', () => {
    const milestone: Milestone = {
      id: 'm1',
      subgoalId: 's1',
      title: 'First 10k',
      description: 'continuous',
      status: 'active',
      order: 1,
      aiSuggested: true,
      completedAt: '2026-05-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    expect(milestoneFromRow(milestoneToRow(milestone))).toEqual(milestone)
  })

  it('task (all optionals present)', () => {
    const task: Task = {
      id: 't1',
      subgoalId: 's1',
      milestoneId: 'm1',
      title: 'Long run',
      description: 'zone 2',
      status: 'pending',
      priority: 'medium',
      dueDate: '2026-07-21',
      scheduledDate: '2026-07-20',
      estimatedMinutes: 35,
      effort: 'M',
      isRecurring: false,
      completedAt: '2026-07-20T09:00:00.000Z',
      rescheduleCount: 2,
      order: 2,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    }
    expect(taskFromRow(taskToRow(task))).toEqual(task)
  })

  it('dependency', () => {
    const dep: Dependency = {
      id: 'd1',
      fromId: 's1',
      toId: 's2',
      type: 'subgoal',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    expect(dependencyFromRow(dependencyToRow(dep))).toEqual(dep)
  })

  it('goal context with strategy brief', () => {
    const ctx: GoalContext = {
      goalId: 'g1',
      successDefinition: 'finish under 2h',
      startingLevel: 'runs 5k',
      priorExperience: 'one 10k',
      deadlineHardness: 'hard',
      motivation: 'always wanted to',
      learnings: 'pacing matters',
      strategyBrief: {
        sharpenedTarget: 'Sub-2:00 half',
        theme: 'consistency',
        priorities: [{ title: 'Base', rationale: 'aerobic engine' }],
        notes: ['no speedwork early'],
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    expect(goalContextFromRow(goalContextToRow(ctx))).toEqual(ctx)
  })

  it('user profile (id restored to the single-row sentinel)', () => {
    const profile: UserProfile = {
      id: 'me',
      name: 'Ada',
      availableHoursPerDay: 5,
      timezone: 'Europe/Berlin',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    expect(userProfileFromRow(userProfileToRow(profile))).toEqual(profile)
  })

  it('user context (all optionals present)', () => {
    const ctx: UserContext = {
      id: 'me',
      situation: 'both',
      situationDetail: 'part-time job',
      lightDays: [0, 6],
      bestTimeOfDay: 'morning',
      workRhythm: 'structured',
      about: 'prefers mornings',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    expect(userContextFromRow(userContextToRow(ctx))).toEqual(ctx)
  })

  it('snapshot', () => {
    const snap: ProgressSnapshot = {
      id: 'p1',
      goalId: 'g1',
      capturedAt: '2026-07-01T00:00:00.000Z',
      goalProgressPercent: 42,
      completedTaskCount: 8,
      totalTaskCount: 19,
      completedMilestoneCount: 1,
      totalMilestoneCount: 4,
    }
    expect(snapshotFromRow(snapshotToRow(snap))).toEqual(snap)
  })

  it('slip event', () => {
    const event: SlipEvent = {
      id: 'e1',
      taskId: 't1',
      goalId: 'g1',
      reason: 'no_time',
      at: '2026-07-15T00:00:00.000Z',
    }
    expect(slipEventFromRow(slipEventToRow(event))).toEqual(event)
  })

  it('opportunity (all optionals present)', () => {
    const opp: Opportunity = {
      id: 'o1',
      type: 'hackathon',
      title: 'DubHacks',
      organization: 'UW',
      description: 'weekend build',
      deadline: '2026-09-01',
      startDate: '2026-10-01',
      endDate: '2026-10-02',
      url: 'https://example.com',
      location: 'Seattle',
      relevanceScore: 88,
      matchedGoalIds: ['g1', 'g2'],
      tags: ['ai', 'weekend'],
      source: 'ai_search',
      addedToRoadmap: false,
      dismissed: false,
      savedAt: '2026-07-01T00:00:00.000Z',
    }
    expect(opportunityFromRow(opportunityToRow(opp))).toEqual(opp)
  })
})

// Postgres returns NULL for an absent optional; the domain shape uses `undefined`, so
// each nullable column must come back undefined (not null) — otherwise checks like
// `task.milestoneId === undefined` and the strategy-brief preservation logic break.
describe('fromRows coerces NULL columns to undefined', () => {
  it('nulls a loose task milestone link back to undefined', () => {
    const task = taskFromRow({
      id: 't2',
      subgoal_id: 's1',
      milestone_id: null,
      title: 'Stretch',
      description: null,
      status: 'pending',
      priority: 'low',
      due_date: null,
      scheduled_date: null,
      estimated_minutes: null,
      effort: null,
      is_recurring: false,
      completed_at: null,
      reschedule_count: null,
      order: 0,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    })
    expect(task.milestoneId).toBeUndefined()
    expect(task.description).toBeUndefined()
    expect(task.scheduledDate).toBeUndefined()
    expect(task.effort).toBeUndefined()
    // reschedule_count is NOT NULL DEFAULT 0 in Postgres, but a defensive NULL still
    // maps to the domain default 0 (never undefined) so Reliability math stays valid.
    expect(task.rescheduleCount).toBe(0)
  })

  it('nulls subgoal optionals back to undefined', () => {
    const subgoal = subgoalFromRow({
      id: 's1',
      goal_id: 'g1',
      title: 'Base building',
      description: '',
      target_date: null,
      status: 'active',
      requires_consistency: true,
      estimated_daily_minutes: null,
      order: 0,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })
    expect(subgoal.targetDate).toBeUndefined()
    expect(subgoal.estimatedDailyMinutes).toBeUndefined()
  })

  it('defaults absent goal-context arrays/objects and nullable text', () => {
    const ctx = goalContextFromRow({
      goal_id: 'g1',
      success_definition: null,
      starting_level: null,
      prior_experience: null,
      deadline_hardness: 'soft',
      motivation: null,
      learnings: null,
      strategy_brief: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })
    expect(ctx.successDefinition).toBeUndefined()
    expect(ctx.strategyBrief).toBeUndefined()
    expect(ctx.deadlineHardness).toBe('soft')
  })
})
