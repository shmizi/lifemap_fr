import { describe, it, expect } from 'vitest'
import { buildIntakePrompt, MAX_INTAKE_QUESTIONS } from '@/engine/ai/prompts/intake'

describe('buildIntakePrompt', () => {
  it('carries the goal + category and asks for the JSON-array-of-strings contract', () => {
    const req = buildIntakePrompt({
      goalTitle: 'Get into a top robotics grad school',
      goalDescription: 'Two years to build the profile',
      goalCategory: 'Education',
      targetDate: '2028-08-01',
    })
    const text = req.messages[0].content
    expect(text).toContain('Get into a top robotics grad school')
    expect(text).toContain('Education')
    expect(text).toContain('2028-08-01')
    expect(req.system.toLowerCase()).toContain('intake questions')
    expect(req.system).toContain('JSON array of question strings')
  })

  it('runs at the quality tier (deciding what to ask is nuanced)', () => {
    expect(
      buildIntakePrompt({ goalTitle: 'X', goalDescription: '', goalCategory: 'Education' })
        .tier,
    ).toBe('quality')
  })

  it('splices existing context so the model does not re-ask it', () => {
    const text = buildIntakePrompt({
      goalTitle: 'X',
      goalDescription: '',
      goalCategory: 'Education',
      userContext: { situation: 'Student', availableHoursPerDay: 3 },
      goalContext: { deadlineHardness: 'hard', startingLevel: 'beginner' },
    }).messages[0].content
    expect(text).toContain('About the person')
    expect(text).toContain('beginner')
  })

  it('keeps the question cap small', () => {
    expect(MAX_INTAKE_QUESTIONS).toBeLessThanOrEqual(8)
  })
})
