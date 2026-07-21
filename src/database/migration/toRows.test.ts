import { describe, it, expect } from 'vitest'
import type {
  Goal,
  Subgoal,
  Task,
  GoalContext,
  UserProfile,
  Opportunity,
} from '@/core/types'
import {
  goalToRow,
  subgoalToRow,
  taskToRow,
  goalContextToRow,
  userProfileToRow,
  opportunityToRow,
} from '@/database/migration/toRows'

describe('toRows mappers', () => {
  it('maps a goal to snake_case and never emits user_id', () => {
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
    const row = goalToRow(goal)
    expect(row).toEqual({
      id: 'g1',
      title: 'Run a half marathon',
      description: 'road race',
      category: 'health',
      target_date: '2026-11-30',
      status: 'active',
      priority: 'high',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-02-01T00:00:00.000Z',
    })
    expect('user_id' in row).toBe(false)
  })

  it('coerces absent optionals to null (subgoal)', () => {
    const subgoal: Subgoal = {
      id: 's1',
      goalId: 'g1',
      title: 'Base building',
      description: '',
      status: 'active',
      requiresConsistency: true,
      order: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      // targetDate + estimatedDailyMinutes intentionally absent
    }
    const row = subgoalToRow(subgoal)
    expect(row.target_date).toBeNull()
    expect(row.estimated_daily_minutes).toBeNull()
    expect(row.requires_consistency).toBe(true)
    expect(row.goal_id).toBe('g1')
    expect(row.order).toBe(0)
  })

  it('preserves present optionals and the milestone link (task)', () => {
    const task: Task = {
      id: 't1',
      subgoalId: 's1',
      milestoneId: 'm1',
      title: 'Long run',
      status: 'pending',
      priority: 'medium',
      scheduledDate: '2026-07-20',
      estimatedMinutes: 35,
      effort: 'M',
      isRecurring: false,
      order: 2,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    }
    const row = taskToRow(task)
    expect(row.milestone_id).toBe('m1')
    expect(row.scheduled_date).toBe('2026-07-20')
    expect(row.estimated_minutes).toBe(35)
    expect(row.effort).toBe('M')
    expect(row.due_date).toBeNull()
    expect(row.is_recurring).toBe(false)
  })

  it('nulls an absent milestone link (loose task)', () => {
    const task: Task = {
      id: 't2',
      subgoalId: 's1',
      title: 'Stretch',
      status: 'pending',
      priority: 'low',
      isRecurring: false,
      order: 0,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    }
    expect(taskToRow(task).milestone_id).toBeNull()
  })

  it('passes the strategy brief object through for jsonb (goal context)', () => {
    const ctx: GoalContext = {
      goalId: 'g1',
      deadlineHardness: 'hard',
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
    const row = goalContextToRow(ctx)
    expect(row.goal_id).toBe('g1')
    expect(row.deadline_hardness).toBe('hard')
    expect(row.strategy_brief).toEqual(ctx.strategyBrief)
    expect(row.success_definition).toBeNull()
  })

  it('drops the single-row id from the user profile', () => {
    const profile: UserProfile = {
      id: 'me',
      name: 'Ada',
      availableHoursPerDay: 5,
      timezone: 'Europe/Berlin',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const row = userProfileToRow(profile)
    expect('id' in row).toBe(false)
    expect('user_id' in row).toBe(false)
    expect(row.available_hours_per_day).toBe(5)
    expect(row.timezone).toBe('Europe/Berlin')
  })

  it('keeps arrays intact (opportunity)', () => {
    const opp: Opportunity = {
      id: 'o1',
      type: 'hackathon',
      title: 'DubHacks',
      organization: 'UW',
      description: '',
      url: 'https://example.com',
      matchedGoalIds: ['g1', 'g2'],
      tags: ['ai', 'weekend'],
      source: 'ai_search',
      addedToRoadmap: false,
      dismissed: false,
      savedAt: '2026-07-01T00:00:00.000Z',
    }
    const row = opportunityToRow(opp)
    expect(row.matched_goal_ids).toEqual(['g1', 'g2'])
    expect(row.tags).toEqual(['ai', 'weekend'])
    expect(row.relevance_score).toBeNull()
    expect(row.added_to_roadmap).toBe(false)
  })
})
