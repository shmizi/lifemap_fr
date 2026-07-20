import { describe, it, expect } from 'vitest'
import { buildDailyPlanPrompt } from '@/engine/ai/prompts/dailyPlan'
import { parseSuggestionList } from '@/engine/ai/parsers/suggestionList'
import { parsePlannedSessions } from '@/engine/ai/parsers/plannedSessions'
import { scheduleDailyTasks } from '@/engine/ai/scheduleDailyTasks'
import { MockAI } from '@/services/ai/MockAI'
import type { DailyPlanContext } from '@/engine/ai/types'

const userText = (ctx: DailyPlanContext): string =>
  buildDailyPlanPrompt(ctx).messages[0].content

const base: DailyPlanContext = {
  subgoalTitle: 'Get German to B2',
  subgoalDescription: 'Daily vocabulary and grammar.',
  goalTitle: 'Get into RWTH Aachen',
  dailyMinutes: 30,
  days: 7,
}

describe('buildDailyPlanPrompt', () => {
  it('produces a system instruction plus a single user message', () => {
    const request = buildDailyPlanPrompt(base)
    expect(request.system.length).toBeGreaterThan(0)
    expect(request.messages).toHaveLength(1)
    expect(request.messages[0].role).toBe('user')
  })

  it('lists titles already planned elsewhere so the model does not duplicate them', () => {
    const text = userText({
      ...base,
      plannedElsewhere: ['Map robotics & AI faculty at target universities'],
    })
    expect(text).toContain('Already planned elsewhere')
    expect(text).toContain('- Map robotics & AI faculty at target universities')
  })

  it('omits the de-dup block when nothing is planned elsewhere', () => {
    expect(userText(base)).not.toContain('Already planned elsewhere')
    expect(userText({ ...base, plannedElsewhere: [] })).not.toContain(
      'Already planned elsewhere',
    )
  })

  it('carries the subgoal, goal, minutes, and day count into the message', () => {
    const text = userText(base)
    expect(text).toContain('Get German to B2')
    expect(text).toContain('Get into RWTH Aachen')
    expect(text).toContain('Minutes per day: 30')
    expect(text).toContain('Days to plan: 7')
  })

  it('asks for a JSON array in the system instruction', () => {
    expect(buildDailyPlanPrompt(base).system).toContain('JSON array')
  })

  it('asks the model to size each session with a minutes estimate', () => {
    const system = buildDailyPlanPrompt(base).system
    expect(system).toContain('minutes')
    // The output shape must include the numeric minutes field.
    expect(system).toContain('"minutes": number')
  })

  it('invites the model to mark maintenance sessions recurring', () => {
    const system = buildDailyPlanPrompt(base).system
    expect(system).toContain('recurrence')
    expect(system).toContain('everyDays')
  })

  it('tells the model to use recurrence sparingly and not daily', () => {
    // Guards against the observed over-use (a plan dumping dozens of daily
    // recurring occurrences): the prompt must cap the count and steer off daily.
    const system = buildDailyPlanPrompt(base).system
    expect(system).toContain('at most one or two')
    expect(system).toContain('not daily')
  })

  it('splices the roadmap digest into the message when provided', () => {
    const text = userText({
      ...base,
      digest: {
        goalTitle: 'Get German to B2',
        tracks: [
          {
            title: 'Vocabulary',
            phases: [{ title: 'Core 500', done: true, taskCount: 5 }],
            currentPhase: null,
          },
        ],
        recent: {
          windowStart: '2026-06-05',
          windowEnd: '2026-06-18',
          completed: 4,
          missed: 1,
        },
      },
    })
    expect(text).toContain('Roadmap so far')
    expect(text).toContain('Vocabulary')
    expect(text).toContain('Last 2 weeks')
  })

  it('omits the digest lines when no digest is provided', () => {
    expect(userText(base)).not.toContain('Roadmap so far')
  })

  it('omits the description line when the subgoal description is blank', () => {
    expect(userText({ ...base, subgoalDescription: '  ' })).not.toContain(
      'What completing this subgoal looks like:',
    )
  })
})

describe('MockAI daily-plan round trip', () => {
  it('produces dated tasks matching the requested day count', async () => {
    // End-to-end: prompt -> MockAI daily branch -> shared parser -> scheduler.
    const request = buildDailyPlanPrompt({ ...base, days: 5 })
    const response = await new MockAI().complete(request)
    const sessions = parseSuggestionList(response, 5)
    const plan = scheduleDailyTasks(sessions, new Date(2026, 5, 25), 30)
    expect(plan).toHaveLength(5)
    expect(plan[0].scheduledDate).toBe('2026-06-25')
    expect(plan[4].scheduledDate).toBe('2026-06-29')
    expect(plan.every((t) => t.estimatedMinutes === 30)).toBe(true)
    // The mock names the subgoal in each session description.
    expect(plan[0].description).toContain('Get German to B2')
  })

  it('carries the model-decided per-session minutes through the scheduler', () => {
    // Same path but via parsePlannedSessions, which KEEPS the mock's varying
    // minutes — so scheduled tasks reflect real per-session durations, not a
    // single flat estimate.
    const request = buildDailyPlanPrompt({ ...base, days: 4 })
    return new MockAI().complete(request).then((response) => {
      const sessions = parsePlannedSessions(response, 4)
      const plan = scheduleDailyTasks(sessions, new Date(2026, 5, 25), 30)
      // MOCK_SESSION_MINUTES cycles [20, 30, 45, 30].
      expect(plan.map((t) => t.estimatedMinutes)).toEqual([20, 30, 45, 30])
    })
  })

  it('emits at least one recurring session for the overlay path', () => {
    const request = buildDailyPlanPrompt({ ...base, days: 4 })
    return new MockAI().complete(request).then((response) => {
      const sessions = parsePlannedSessions(response, 4)
      expect(sessions.some((s) => s.recurrence !== undefined)).toBe(true)
    })
  })
})
