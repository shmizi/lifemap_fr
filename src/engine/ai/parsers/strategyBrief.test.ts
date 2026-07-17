import { describe, it, expect } from 'vitest'
import {
  parseStrategyBrief,
  extractJsonObject,
} from '@/engine/ai/parsers/strategyBrief'
import { MAX_BRIEF_PRIORITIES } from '@/engine/ai/prompts/strategyBrief'

const asResponse = (text: string) => ({ text })

describe('parseStrategyBrief', () => {
  it('parses a clean brief object', () => {
    const brief = parseStrategyBrief(
      asResponse(
        JSON.stringify({
          sharpenedTarget: 'Be competitive for top robotics grad schools by 2028',
          theme: 'Intelligent Autonomous Systems',
          priorities: [
            { title: 'DSA', rationale: 'Highest ROI' },
            { title: 'Robotics credibility', rationale: 'Turns student into engineer' },
          ],
          notes: ['Keep GATE and GRE both open'],
        }),
      ),
    )
    expect(brief).not.toBeNull()
    expect(brief?.sharpenedTarget).toContain('robotics grad schools')
    expect(brief?.theme).toBe('Intelligent Autonomous Systems')
    expect(brief?.priorities).toHaveLength(2)
    expect(brief?.priorities[0]).toEqual({ title: 'DSA', rationale: 'Highest ROI' })
    expect(brief?.notes).toEqual(['Keep GATE and GRE both open'])
  })

  it('tolerates code fences and surrounding prose', () => {
    const brief = parseStrategyBrief(
      asResponse(
        'Here is your brief:\n```json\n{"sharpenedTarget":"Ship LifeMap v1","theme":"","priorities":[],"notes":[]}\n```\nHope that helps.',
      ),
    )
    expect(brief?.sharpenedTarget).toBe('Ship LifeMap v1')
    expect(brief?.theme).toBe('')
    expect(brief?.priorities).toEqual([])
  })

  it('returns null for prose with no object', () => {
    expect(parseStrategyBrief(asResponse('I could not build a brief.'))).toBeNull()
  })

  it('returns null when the target is missing or blank', () => {
    expect(
      parseStrategyBrief(asResponse(JSON.stringify({ theme: 'x', priorities: [], notes: [] }))),
    ).toBeNull()
    expect(
      parseStrategyBrief(
        asResponse(JSON.stringify({ sharpenedTarget: '   ', priorities: [], notes: [] })),
      ),
    ).toBeNull()
  })

  it('never throws on truncated JSON', () => {
    expect(parseStrategyBrief(asResponse('{"sharpenedTarget":"x", "priorities":['))).toBeNull()
  })

  it('defaults missing theme/priorities/notes to empty, not fatal', () => {
    const brief = parseStrategyBrief(asResponse('{"sharpenedTarget":"Just the target"}'))
    expect(brief).toEqual({
      sharpenedTarget: 'Just the target',
      theme: '',
      priorities: [],
      notes: [],
    })
  })

  it('drops malformed priorities (blank/absent title, non-objects)', () => {
    const brief = parseStrategyBrief(
      asResponse(
        JSON.stringify({
          sharpenedTarget: 'T',
          priorities: [
            { title: 'Kept', rationale: 'ok' },
            { title: '   ', rationale: 'blank title' },
            'a string',
            { rationale: 'no title' },
            { title: 'Kept two' },
          ],
          notes: ['good', '  ', 42],
        }),
      ),
    )
    expect(brief?.priorities).toEqual([
      { title: 'Kept', rationale: 'ok' },
      { title: 'Kept two', rationale: '' },
    ])
    // Only non-blank string notes survive.
    expect(brief?.notes).toEqual(['good'])
  })

  it('caps priorities at MAX_BRIEF_PRIORITIES', () => {
    const many = Array.from({ length: MAX_BRIEF_PRIORITIES + 4 }, (_, i) => ({
      title: `P${i}`,
      rationale: 'r',
    }))
    const brief = parseStrategyBrief(
      asResponse(JSON.stringify({ sharpenedTarget: 'T', priorities: many, notes: [] })),
    )
    expect(brief?.priorities).toHaveLength(MAX_BRIEF_PRIORITIES)
  })
})

describe('extractJsonObject', () => {
  it('returns null when no braces are present', () => {
    expect(extractJsonObject('no object here')).toBeNull()
  })

  it('rejects a bare array (that is not an object)', () => {
    expect(extractJsonObject('[1, 2, 3]')).toBeNull()
  })

  it('extracts an object embedded in prose', () => {
    expect(extractJsonObject('prefix {"a":1} suffix')).toEqual({ a: 1 })
  })
})
