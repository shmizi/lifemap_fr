import { describe, it, expect } from 'vitest'
import {
  buildSubgoalPrompt,
  SUGGESTED_SUBGOAL_COUNT,
} from '@/engine/ai/prompts/subgoals'
import type { SubgoalSuggestionContext } from '@/engine/ai/types'

const userText = (ctx: SubgoalSuggestionContext): string =>
  buildSubgoalPrompt(ctx).messages[0].content

const base: SubgoalSuggestionContext = {
  goalTitle: 'Get into RWTH Aachen',
  goalDescription: 'Admission to the CS masters programme.',
  goalCategory: 'Education',
}

describe('buildSubgoalPrompt', () => {
  it('produces a system instruction plus a single user message', () => {
    const request = buildSubgoalPrompt(base)
    expect(request.system.length).toBeGreaterThan(0)
    expect(request.messages).toHaveLength(1)
    expect(request.messages[0].role).toBe('user')
  })

  it('carries the goal title, category, and description into the message', () => {
    const text = userText(base)
    expect(text).toContain('Get into RWTH Aachen')
    expect(text).toContain('Education')
    expect(text).toContain('Admission to the CS masters programme.')
  })

  it('asks for a JSON array in the system instruction', () => {
    expect(buildSubgoalPrompt(base).system).toContain('JSON array')
  })

  it('caps the requested count at SUGGESTED_SUBGOAL_COUNT', () => {
    expect(buildSubgoalPrompt(base).system).toContain(
      String(SUGGESTED_SUBGOAL_COUNT),
    )
  })

  it('omits the description line when the goal description is blank', () => {
    const text = userText({ ...base, goalDescription: '   ' })
    expect(text).not.toContain('Goal description:')
  })

  it('lists existing subgoal titles so they are not repeated', () => {
    const text = userText({
      ...base,
      existingSubgoalTitles: ['Get German to B2', 'Prepare documents'],
    })
    expect(text).toContain('Get German to B2')
    expect(text).toContain('Prepare documents')
  })

  it('omits the existing-subgoals line when none are passed', () => {
    expect(userText(base)).not.toContain('do not repeat')
    expect(userText({ ...base, existingSubgoalTitles: [] })).not.toContain(
      'do not repeat',
    )
  })
})
