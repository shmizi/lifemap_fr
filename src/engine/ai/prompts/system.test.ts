import { describe, it, expect } from 'vitest'
import {
  LIFEMAP_SYSTEM_PROMPT,
  renderUserContextLines,
  renderGoalContextLines,
} from '@/engine/ai/prompts/system'
import { buildSubgoalPrompt } from '@/engine/ai/prompts/subgoals'
import { buildMilestonePrompt } from '@/engine/ai/prompts/milestones'
import type { AIUserContext, AIGoalContext } from '@/engine/ai/types'

describe('LIFEMAP_SYSTEM_PROMPT', () => {
  it('describes the goal -> subgoal -> milestone -> task hierarchy', () => {
    expect(LIFEMAP_SYSTEM_PROMPT.length).toBeGreaterThan(0)
    expect(LIFEMAP_SYSTEM_PROMPT).toContain('subgoals')
    expect(LIFEMAP_SYSTEM_PROMPT).toContain('milestones')
    expect(LIFEMAP_SYSTEM_PROMPT.toLowerCase()).toContain('hard')
  })
})

describe('renderUserContextLines', () => {
  it('returns [] when no context is given', () => {
    expect(renderUserContextLines()).toEqual([])
    expect(renderUserContextLines(undefined)).toEqual([])
  })

  it('renders the fields it is given', () => {
    const ctx: AIUserContext = {
      situation: 'Student',
      situationDetail: 'final-year CS',
      availableHoursPerDay: 3,
      lightDays: ['Sat', 'Sun'],
      bestTimeOfDay: 'Mornings',
      workRhythm: 'Structured and steady',
      about: 'strong at math',
    }
    const text = renderUserContextLines(ctx).join('\n')
    expect(text).toContain('Student')
    expect(text).toContain('final-year CS')
    expect(text).toContain('3')
    expect(text).toContain('Sat, Sun')
    expect(text).toContain('Mornings')
    expect(text).toContain('strong at math')
  })

  it('never emits a line that collides with a MockAI branch marker', () => {
    const ctx: AIUserContext = {
      situation: 'Student',
      about: 'wants to finish a goal and a subgoal and a query',
      availableHoursPerDay: 2,
    }
    for (const line of renderUserContextLines(ctx)) {
      expect(/^(Goal|Subgoal|Query|Days to plan):/.test(line)).toBe(false)
    }
  })
})

describe('renderGoalContextLines', () => {
  it('returns [] when no context is given', () => {
    expect(renderGoalContextLines()).toEqual([])
  })

  it('emits a front-load instruction for a hard deadline', () => {
    const ctx: AIGoalContext = { deadlineHardness: 'hard' }
    const text = renderGoalContextLines(ctx).join('\n')
    expect(text).toContain('HARD')
    expect(text.toLowerCase()).toContain('front-load')
  })

  it('marks a soft deadline as flexible', () => {
    const text = renderGoalContextLines({ deadlineHardness: 'soft' }).join('\n')
    expect(text.toLowerCase()).toContain('flexible')
  })

  it('renders starting level, prior experience, and motivation', () => {
    const text = renderGoalContextLines({
      startingLevel: 'German A2',
      priorExperience: 'one prior attempt',
      motivation: 'study abroad',
    }).join('\n')
    expect(text).toContain('German A2')
    expect(text).toContain('one prior attempt')
    expect(text).toContain('study abroad')
  })
})

describe('context flows into the feature prompts', () => {
  it('subgoal prompt carries user + goal context but keeps no "Subgoal:" line', () => {
    const text = buildSubgoalPrompt({
      goalId: 'g1',
      goalTitle: 'Get into RWTH Aachen',
      goalDescription: '',
      goalCategory: 'Education',
      userContext: { situation: 'Student', availableHoursPerDay: 3 },
      goalContext: { deadlineHardness: 'hard', startingLevel: 'beginner' },
    }).messages[0].content
    expect(text).toContain('About the person')
    expect(text).toContain('HARD')
    expect(text).toContain('beginner')
    // The mock keys "subgoal request" on the ABSENCE of a Subgoal: line — context
    // must not accidentally introduce one.
    expect(text.split('\n').some((l) => l.startsWith('Subgoal:'))).toBe(false)
  })

  it('milestone prompt still carries its "Subgoal:" line alongside context', () => {
    const text = buildMilestonePrompt({
      goalId: 'g1',
      goalTitle: 'Get into RWTH Aachen',
      subgoalTitle: 'Get German to B2',
      subgoalDescription: '',
      userContext: { situation: 'Student' },
      goalContext: { deadlineHardness: 'soft' },
    }).messages[0].content
    expect(text.split('\n').some((l) => l.startsWith('Subgoal:'))).toBe(true)
    expect(text).toContain('About the person')
  })

  it('omits context blocks entirely when none is provided', () => {
    const text = buildSubgoalPrompt({
      goalId: 'g1',
      goalTitle: 'X',
      goalDescription: '',
      goalCategory: 'Education',
    }).messages[0].content
    expect(text).not.toContain('About the person')
    expect(text).not.toContain('deadline')
  })
})
