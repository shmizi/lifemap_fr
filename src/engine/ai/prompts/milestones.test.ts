import { describe, it, expect } from 'vitest'
import {
  buildMilestonePrompt,
  SUGGESTED_MILESTONE_COUNT,
} from '@/engine/ai/prompts/milestones'
import type { MilestoneSuggestionContext } from '@/engine/ai/types'

// The user message is one string; tests read it directly.
const userText = (ctx: MilestoneSuggestionContext): string =>
  buildMilestonePrompt(ctx).messages[0].content

const base: MilestoneSuggestionContext = {
  goalId: 'goal-1',
  subgoalTitle: 'Get German to B2',
  subgoalDescription: 'Conversational fluency for university.',
  goalTitle: 'Get into RWTH Aachen',
}

describe('buildMilestonePrompt', () => {
  it('produces a system instruction plus a single user message', () => {
    const request = buildMilestonePrompt(base)
    expect(request.system.length).toBeGreaterThan(0)
    expect(request.messages).toHaveLength(1)
    expect(request.messages[0].role).toBe('user')
  })

  it('carries the goal and subgoal into the user message', () => {
    const text = userText(base)
    expect(text).toContain('Get into RWTH Aachen')
    expect(text).toContain('Get German to B2')
    expect(text).toContain('Conversational fluency for university.')
  })

  it('asks for a JSON array in the system instruction', () => {
    // The parser depends on this contract; if the prompt stops asking for JSON
    // the two have silently diverged.
    expect(buildMilestonePrompt(base).system).toContain('JSON array')
  })

  it('caps the requested count at SUGGESTED_MILESTONE_COUNT', () => {
    expect(buildMilestonePrompt(base).system).toContain(
      String(SUGGESTED_MILESTONE_COUNT),
    )
  })

  it('omits the description line when the subgoal description is blank', () => {
    const text = userText({ ...base, subgoalDescription: '   ' })
    expect(text).not.toContain('Subgoal description:')
  })

  it('lists existing milestone titles so they are not repeated', () => {
    const text = userText({
      ...base,
      existingMilestoneTitles: ['German A1', 'German A2'],
    })
    expect(text).toContain('German A1')
    expect(text).toContain('German A2')
  })

  it('omits the existing-milestones line when none are passed', () => {
    expect(userText(base)).not.toContain('do not repeat')
    expect(userText({ ...base, existingMilestoneTitles: [] })).not.toContain(
      'do not repeat',
    )
  })
})
