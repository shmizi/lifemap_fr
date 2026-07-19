import { describe, it, expect } from 'vitest'
import { parseStructure } from '@/engine/ai/parsers/structure'
import {
  MAX_STRUCTURE_TRACKS,
  MAX_PHASES_PER_TRACK,
} from '@/engine/ai/prompts/structure'
import type { AIResponse } from '@/engine/ai/types'

const res = (text: string): AIResponse => ({ text })

describe('parseStructure', () => {
  it('returns [] for prose with no JSON array', () => {
    expect(parseStructure(res('I could not build a structure.'))).toEqual([])
  })

  it('parses tracks with their ordered phases', () => {
    const out = parseStructure(
      res(
        JSON.stringify([
          {
            title: 'Language',
            description: 'German to B2',
            phases: [
              { title: 'A2', description: 'Basics' },
              { title: 'B1' },
            ],
          },
          { title: 'Application', phases: [] },
        ]),
      ),
    )
    expect(out).toHaveLength(2)
    expect(out[0].title).toBe('Language')
    expect(out[0].description).toBe('German to B2')
    expect(out[0].phases.map((p) => p.title)).toEqual(['A2', 'B1'])
    expect(out[0].phases[1].description).toBeUndefined()
    expect(out[1].phases).toEqual([])
  })

  it('tolerates a code fence and surrounding prose', () => {
    const out = parseStructure(
      res('```json\n[{"title":"Track","phases":[]}]\n```'),
    )
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Track')
  })

  it('treats a missing or non-array phases field as no phases', () => {
    const out = parseStructure(
      res(JSON.stringify([{ title: 'Bare' }, { title: 'Junk', phases: 'nope' }])),
    )
    expect(out[0].phases).toEqual([])
    expect(out[1].phases).toEqual([])
  })

  it('skips titleless tracks and titleless phases', () => {
    const out = parseStructure(
      res(
        JSON.stringify([
          { description: 'no title' },
          {
            title: 'Real',
            phases: [{ description: 'no title' }, { title: 'Kept' }],
          },
        ]),
      ),
    )
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Real')
    expect(out[0].phases.map((p) => p.title)).toEqual(['Kept'])
  })

  it('trims whitespace on titles and descriptions', () => {
    const out = parseStructure(
      res(JSON.stringify([{ title: '  Track  ', description: '  d  ', phases: [] }])),
    )
    expect(out[0].title).toBe('Track')
    expect(out[0].description).toBe('d')
  })

  it('caps tracks at MAX_STRUCTURE_TRACKS', () => {
    const many = Array.from({ length: MAX_STRUCTURE_TRACKS + 5 }, (_, i) => ({
      title: `T${i}`,
      phases: [],
    }))
    expect(parseStructure(res(JSON.stringify(many)))).toHaveLength(
      MAX_STRUCTURE_TRACKS,
    )
  })

  it('caps phases per track at MAX_PHASES_PER_TRACK', () => {
    const phases = Array.from({ length: MAX_PHASES_PER_TRACK + 4 }, (_, i) => ({
      title: `P${i}`,
    }))
    const out = parseStructure(res(JSON.stringify([{ title: 'T', phases }])))
    expect(out[0].phases).toHaveLength(MAX_PHASES_PER_TRACK)
  })
})
