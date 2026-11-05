import { describe, it, expect } from 'vitest'
import { parsePlanRevision } from './planRevision'
import { MAX_PLAN_REVISION_SUGGESTIONS } from '@/engine/ai/prompts/planRevision'

const res = (text: string) => ({ text })
const obj = (o: unknown) => res(JSON.stringify(o))

describe('parsePlanRevision', () => {
  it('parses a well-formed proposal', () => {
    const out = parsePlanRevision(
      obj({
        summary: 'The tooling changed, so the pandas work is moot.',
        suggestions: [
          { target: 'Pandas fundamentals', action: 'drop', rationale: 'Not used now.' },
          { target: 'Core practice', action: 'replan', rationale: 'Same aim, new tools.' },
        ],
      }),
    )
    expect(out).toEqual({
      summary: 'The tooling changed, so the pandas work is moot.',
      suggestions: [
        { target: 'Pandas fundamentals', action: 'drop', rationale: 'Not used now.' },
        { target: 'Core practice', action: 'replan', rationale: 'Same aim, new tools.' },
      ],
    })
  })

  it('accepts a summary with NO suggestions — "nothing is invalidated" is an answer', () => {
    const out = parsePlanRevision(
      obj({ summary: 'Nothing in the plan is affected by this.', suggestions: [] }),
    )
    expect(out).not.toBeNull()
    expect(out!.suggestions).toEqual([])
  })

  it('DROPS a suggestion with an unknown action rather than defaulting it', () => {
    // Unlike the scope-cut parser, there is no harmless default here — every action
    // mutates the plan, so an unreadable one must not be guessed at.
    const out = parsePlanRevision(
      obj({
        summary: 's',
        suggestions: [
          { target: 'A', action: 'obliterate', rationale: '' },
          { target: 'B', action: 'defer', rationale: '' },
        ],
      }),
    )
    expect(out!.suggestions.map((s) => s.target)).toEqual(['B'])
  })

  it('drops a suggestion with a missing action', () => {
    const out = parsePlanRevision(
      obj({ summary: 's', suggestions: [{ target: 'A', rationale: '' }] }),
    )
    expect(out!.suggestions).toEqual([])
  })

  it('drops a suggestion with no target', () => {
    const out = parsePlanRevision(
      obj({ summary: 's', suggestions: [{ target: '  ', action: 'drop' }] }),
    )
    expect(out!.suggestions).toEqual([])
  })

  it('caps the number of suggestions', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      target: `T${i}`,
      action: 'defer',
      rationale: '',
    }))
    const out = parsePlanRevision(obj({ summary: 's', suggestions: many }))
    expect(out!.suggestions).toHaveLength(MAX_PLAN_REVISION_SUGGESTIONS)
  })

  it('reads through code fences', () => {
    const out = parsePlanRevision(
      res('```json\n{"summary":"s","suggestions":[]}\n```'),
    )
    expect(out!.summary).toBe('s')
  })

  it('returns null for prose, truncated JSON, or an empty reply', () => {
    expect(parsePlanRevision(res('Sure! Here are my thoughts.'))).toBeNull()
    expect(parsePlanRevision(res('{"summary": "s", "sugg'))).toBeNull()
    expect(parsePlanRevision(res(''))).toBeNull()
  })

  it('returns null when there is neither summary nor suggestion', () => {
    expect(parsePlanRevision(obj({ summary: '   ', suggestions: [] }))).toBeNull()
  })

  it('never throws on malformed shapes', () => {
    expect(() =>
      parsePlanRevision(obj({ summary: 's', suggestions: [null, 3, 'x', []] })),
    ).not.toThrow()
  })
})
