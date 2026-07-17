import { describe, it, expect } from 'vitest'
import { MockAI } from '@/services/ai/MockAI'
import { buildStrategyBriefPrompt } from '@/engine/ai/prompts/strategyBrief'
import { parseStrategyBrief } from '@/engine/ai/parsers/strategyBrief'
import { buildSubgoalPrompt } from '@/engine/ai/prompts/subgoals'
import { parseSubgoalSuggestions } from '@/engine/ai/parsers/subgoals'
import { buildIntakePrompt, MAX_INTAKE_QUESTIONS } from '@/engine/ai/prompts/intake'
import { parseIntakeQuestions } from '@/engine/ai/parsers/intake'

// The MockAI branch routing is easy to break (adding a feature that shares a
// marker line). These round-trips prove the strategy-brief prompt reaches the
// brief branch and parses, and that it does NOT steal the subgoal branch — both
// prompts carry a "Goal:" line, so the ordering/keying matters.
describe('MockAI — strategy brief branch', () => {
  const mock = new MockAI()

  it('answers a strategy-brief prompt with a parseable brief that names the goal', async () => {
    const response = await mock.complete(
      buildStrategyBriefPrompt({
        goalId: 'g1',
        goalTitle: 'Get into a top robotics grad school',
        goalDescription: '',
        goalCategory: 'Education',
      }),
    )
    const brief = parseStrategyBrief(response)
    expect(brief).not.toBeNull()
    expect(brief?.sharpenedTarget).toContain('Get into a top robotics grad school')
    expect(brief?.priorities.length).toBeGreaterThan(0)
  })

  it('still routes a subgoal prompt to a suggestion ARRAY, not the brief object', async () => {
    const response = await mock.complete(
      buildSubgoalPrompt({
        goalId: 'g1',
        goalTitle: 'Get into a top robotics grad school',
        goalDescription: '',
        goalCategory: 'Education',
      }),
    )
    // The subgoal reply is an array of suggestions...
    expect(parseSubgoalSuggestions(response).length).toBeGreaterThan(0)
    // ...and is NOT a strategy brief object.
    expect(parseStrategyBrief(response)).toBeNull()
  })

  it('answers an intake prompt with a parseable list of questions', async () => {
    const response = await mock.complete(
      buildIntakePrompt({
        goalTitle: 'Get into a top robotics grad school',
        goalDescription: '',
        goalCategory: 'Education',
      }),
    )
    const questions = parseIntakeQuestions(response, MAX_INTAKE_QUESTIONS)
    expect(questions.length).toBeGreaterThan(0)
    // The intake branch must NOT be mistaken for a strategy brief.
    expect(parseStrategyBrief(response)).toBeNull()
  })
})
