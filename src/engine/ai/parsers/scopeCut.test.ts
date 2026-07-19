import { describe, it, expect } from 'vitest'
import { parseScopeCut } from '@/engine/ai/parsers/scopeCut'
import { MAX_SCOPE_CUT_SUGGESTIONS } from '@/engine/ai/prompts/scopeCut'
import type { AIResponse } from '@/engine/ai/types'

const res = (text: string): AIResponse => ({ text })

describe('parseScopeCut', () => {
  it('returns null for prose with no JSON object', () => {
    expect(parseScopeCut(res('I cannot propose a cut.'))).toBeNull()
  })

  it('parses a summary + suggestions with valid actions', () => {
    const out = parseScopeCut(
      res(
        JSON.stringify({
          summary: 'Focus on core; drop the extras.',
          suggestions: [
            { target: 'Android polish', action: 'defer', rationale: 'Ship iOS first.' },
            { target: 'Onboarding tour', action: 'cut', rationale: 'Not essential.' },
          ],
        }),
      ),
    )
    expect(out).not.toBeNull()
    expect(out?.summary).toBe('Focus on core; drop the extras.')
    expect(out?.suggestions).toHaveLength(2)
    expect(out?.suggestions[0].action).toBe('defer')
    expect(out?.suggestions[1].action).toBe('cut')
  })

  it('tolerates a code fence and surrounding prose', () => {
    const out = parseScopeCut(
      res('```json\n{"summary":"S","suggestions":[]}\n```'),
    )
    expect(out?.summary).toBe('S')
  })

  it('degrades an unknown or missing action to "compress"', () => {
    const out = parseScopeCut(
      res(
        JSON.stringify({
          summary: 'x',
          suggestions: [
            { target: 'A', action: 'nuke', rationale: '' },
            { target: 'B', rationale: 'no action given' },
          ],
        }),
      ),
    )
    expect(out?.suggestions.map((s) => s.action)).toEqual(['compress', 'compress'])
  })

  it('skips suggestions with no target', () => {
    const out = parseScopeCut(
      res(
        JSON.stringify({
          summary: 's',
          suggestions: [{ action: 'cut', rationale: 'no target' }, { target: 'Kept' }],
        }),
      ),
    )
    expect(out?.suggestions.map((s) => s.target)).toEqual(['Kept'])
  })

  it('is usable with a summary but no suggestions', () => {
    const out = parseScopeCut(res(JSON.stringify({ summary: 'Just push harder.' })))
    expect(out?.summary).toBe('Just push harder.')
    expect(out?.suggestions).toEqual([])
  })

  it('returns null when there is neither summary nor a suggestion', () => {
    expect(parseScopeCut(res(JSON.stringify({ suggestions: [] })))).toBeNull()
  })

  it('caps suggestions at MAX_SCOPE_CUT_SUGGESTIONS', () => {
    const many = Array.from({ length: MAX_SCOPE_CUT_SUGGESTIONS + 4 }, (_, i) => ({
      target: `T${i}`,
      action: 'cut',
      rationale: '',
    }))
    const out = parseScopeCut(res(JSON.stringify({ summary: 's', suggestions: many })))
    expect(out?.suggestions).toHaveLength(MAX_SCOPE_CUT_SUGGESTIONS)
  })
})
