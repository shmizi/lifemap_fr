import { describe, it, expect } from 'vitest'
import {
  parseMilestoneSuggestions,
  MAX_MILESTONE_SUGGESTIONS,
} from '@/engine/ai/parsers/milestones'
import { buildMilestonePrompt } from '@/engine/ai/prompts/milestones'
import { MockAI } from '@/services/ai/MockAI'

// Sugar: parse a raw model text directly.
const parse = (text: string) => parseMilestoneSuggestions({ text })

describe('parseMilestoneSuggestions', () => {
  it('parses a clean JSON array of suggestions', () => {
    const result = parse(
      '[{"title":"A1","description":"basics"},{"title":"A2"}]',
    )
    expect(result).toEqual([
      { title: 'A1', description: 'basics' },
      { title: 'A2' },
    ])
  })

  it('strips markdown code fences around the array', () => {
    const result = parse('```json\n[{"title":"A1"}]\n```')
    expect(result).toEqual([{ title: 'A1' }])
  })

  it('ignores prose surrounding the array', () => {
    const result = parse(
      'Sure! Here are some milestones:\n[{"title":"A1"}]\nHope that helps.',
    )
    expect(result).toEqual([{ title: 'A1' }])
  })

  it('returns an empty array for non-JSON text', () => {
    expect(parse('I cannot help with that.')).toEqual([])
  })

  it('returns an empty array for a JSON object (not an array)', () => {
    expect(parse('{"title":"A1"}')).toEqual([])
  })

  it('returns an empty array for malformed/truncated JSON', () => {
    expect(parse('[{"title":"A1", ')).toEqual([])
  })

  it('drops items with a missing or blank title', () => {
    const result = parse(
      '[{"title":""},{"description":"no title"},{"title":"  "},{"title":"Keep"}]',
    )
    expect(result).toEqual([{ title: 'Keep' }])
  })

  it('skips non-object array elements without failing', () => {
    const result = parse('["a string", 42, null, {"title":"Keep"}]')
    expect(result).toEqual([{ title: 'Keep' }])
  })

  it('trims whitespace and drops a blank description to undefined', () => {
    const result = parse('[{"title":"  A1  ","description":"   "}]')
    expect(result).toEqual([{ title: 'A1' }])
  })

  it('ignores extra fields the model may invent', () => {
    const result = parse('[{"title":"A1","order":3,"foo":"bar"}]')
    expect(result).toEqual([{ title: 'A1' }])
  })

  it('caps the number of suggestions at MAX_MILESTONE_SUGGESTIONS', () => {
    const many = Array.from({ length: MAX_MILESTONE_SUGGESTIONS + 4 }, (_, i) => ({
      title: `M${i}`,
    }))
    const result = parse(JSON.stringify(many))
    expect(result).toHaveLength(MAX_MILESTONE_SUGGESTIONS)
  })
})

describe('MockAI <-> parser round trip', () => {
  it('parses MockAI output into non-empty suggestions', async () => {
    // Proves prompt, mock, and parser agree on the wire format end-to-end.
    const request = buildMilestonePrompt({
      subgoalTitle: 'Get German to B2',
      subgoalDescription: '',
      goalTitle: 'Get into RWTH Aachen',
    })
    const response = await new MockAI().complete(request)
    const result = parseMilestoneSuggestions(response)
    expect(result.length).toBeGreaterThan(0)
    // The mock personalises descriptions with the subgoal title.
    expect(result[0].description).toContain('Get German to B2')
  })
})
