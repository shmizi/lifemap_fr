import { describe, it, expect } from 'vitest'
import { buildDailyPlanPrompt } from '@/engine/ai/prompts/dailyPlan'
import { parseSuggestionList } from '@/engine/ai/parsers/suggestionList'
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

  it('omits the description line when the subgoal description is blank', () => {
    expect(userText({ ...base, subgoalDescription: '  ' })).not.toContain(
      'Subgoal description:',
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
})
