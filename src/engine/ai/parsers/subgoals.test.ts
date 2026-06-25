import { describe, it, expect } from 'vitest'
import {
  parseSubgoalSuggestions,
  MAX_SUBGOAL_SUGGESTIONS,
} from '@/engine/ai/parsers/subgoals'
import { buildSubgoalPrompt } from '@/engine/ai/prompts/subgoals'
import { MockAI } from '@/services/ai/MockAI'

// The tolerant-parsing edge cases (fences, prose, malformed, blank titles, etc.)
// are covered against the shared primitive in parsers/milestones.test.ts. Here
// we verify the subgoal wrapper: it parses, caps with its own limit, and agrees
// with the MockAI subgoal branch end-to-end.
const parse = (text: string) => parseSubgoalSuggestions({ text })

describe('parseSubgoalSuggestions', () => {
  it('parses a clean JSON array of suggestions', () => {
    const result = parse(
      '[{"title":"German B2","description":"language"},{"title":"Documents"}]',
    )
    expect(result).toEqual([
      { title: 'German B2', description: 'language' },
      { title: 'Documents' },
    ])
  })

  it('returns an empty array for non-JSON text', () => {
    expect(parse('I cannot help with that.')).toEqual([])
  })

  it('caps the number of suggestions at MAX_SUBGOAL_SUGGESTIONS', () => {
    const many = Array.from({ length: MAX_SUBGOAL_SUGGESTIONS + 4 }, (_, i) => ({
      title: `S${i}`,
    }))
    expect(parse(JSON.stringify(many))).toHaveLength(MAX_SUBGOAL_SUGGESTIONS)
  })
})

describe('MockAI <-> subgoal parser round trip', () => {
  it('parses MockAI subgoal output into non-empty suggestions', async () => {
    // A subgoal prompt names only a "Goal:" line; the mock must return
    // subgoal-shaped items personalised with the goal title.
    const request = buildSubgoalPrompt({
      goalTitle: 'Get into RWTH Aachen',
      goalDescription: '',
      goalCategory: 'Education',
    })
    const response = await new MockAI().complete(request)
    const result = parseSubgoalSuggestions(response)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].description).toContain('Get into RWTH Aachen')
  })
})
