import { describe, it, expect } from 'vitest'
import { parseIntakeQuestions } from '@/engine/ai/parsers/intake'

const asResponse = (text: string) => ({ text })

describe('parseIntakeQuestions', () => {
  it('parses a clean array of question strings', () => {
    const qs = parseIntakeQuestions(
      asResponse(JSON.stringify(['What is your budget?', 'When is the deadline?'])),
      6,
    )
    expect(qs).toEqual(['What is your budget?', 'When is the deadline?'])
  })

  it('tolerates fences and prose', () => {
    const qs = parseIntakeQuestions(
      asResponse('Sure:\n```json\n["Q1","Q2"]\n```\nGood luck.'),
      6,
    )
    expect(qs).toEqual(['Q1', 'Q2'])
  })

  it('also accepts {question} objects (format drift)', () => {
    const qs = parseIntakeQuestions(
      asResponse(JSON.stringify([{ question: 'How firm is the date?' }, { question: '  ' }])),
      6,
    )
    expect(qs).toEqual(['How firm is the date?'])
  })

  it('drops blank and non-string/objectless entries', () => {
    const qs = parseIntakeQuestions(
      asResponse(JSON.stringify(['Keep', '   ', 42, null, { nope: 'x' }, 'Keep two'])),
      6,
    )
    expect(qs).toEqual(['Keep', 'Keep two'])
  })

  it('caps at max', () => {
    const many = Array.from({ length: 10 }, (_, i) => `Q${i}`)
    expect(parseIntakeQuestions(asResponse(JSON.stringify(many)), 4)).toHaveLength(4)
  })

  it('returns [] for prose with no array (never throws)', () => {
    expect(parseIntakeQuestions(asResponse('no questions here'), 6)).toEqual([])
    expect(parseIntakeQuestions(asResponse('["truncated'), 6)).toEqual([])
  })
})
