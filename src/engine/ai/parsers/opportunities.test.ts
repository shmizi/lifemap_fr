import { describe, expect, it } from 'vitest'
import { parseOpportunityCandidates } from '@/engine/ai/parsers/opportunities'
import {
  buildOpportunityExtractionPrompt,
  EXTRACTED_OPPORTUNITY_COUNT,
} from '@/engine/ai/prompts/opportunities'
import { MockAI } from '@/services/ai/MockAI'

// Sugar: parse raw model text directly.
const parse = (text: string, max = EXTRACTED_OPPORTUNITY_COUNT) =>
  parseOpportunityCandidates({ text }, max)

describe('parseOpportunityCandidates', () => {
  it('parses a clean JSON array with full fields', () => {
    const result = parse(
      JSON.stringify([
        {
          type: 'internship',
          title: 'ML Intern',
          organization: 'Acme',
          description: 'Summer role',
          url: 'https://a.com',
          deadline: '2026-08-01',
          location: 'Remote',
          tags: ['ML', 'paid'],
        },
      ]),
    )
    expect(result).toEqual([
      {
        type: 'internship',
        title: 'ML Intern',
        organization: 'Acme',
        description: 'Summer role',
        url: 'https://a.com',
        deadline: '2026-08-01',
        location: 'Remote',
        tags: ['ML', 'paid'],
      },
    ])
  })

  it('strips markdown fences and surrounding prose', () => {
    const result = parse(
      'Here you go:\n```json\n[{"title":"T","url":"https://a.com"}]\n```\ndone',
    )
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('T')
  })

  it('returns [] for non-JSON, a bare object, or malformed JSON', () => {
    expect(parse('I found nothing.')).toEqual([])
    expect(parse('{"title":"T","url":"u"}')).toEqual([])
    expect(parse('[{"title":"T","url":"u",')).toEqual([])
  })

  it('drops a candidate missing a title or a url', () => {
    const result = parse(
      JSON.stringify([
        { title: '', url: 'https://a.com' },
        { title: 'No URL', url: '' },
        { title: 'Keep', url: 'https://k.com' },
      ]),
    )
    expect(result.map((c) => c.title)).toEqual(['Keep'])
  })

  it('coerces an unknown or missing type to other (never drops the item)', () => {
    const result = parse(
      JSON.stringify([
        { title: 'A', url: 'https://a.com', type: 'banana' },
        { title: 'B', url: 'https://b.com' },
      ]),
    )
    expect(result.map((c) => c.type)).toEqual(['other', 'other'])
  })

  it('defaults missing optional fields and sanitises tags', () => {
    const result = parse(
      JSON.stringify([
        { title: 'A', url: 'https://a.com', tags: ['x', '', 'x', 3, 'y'] },
      ]),
    )
    expect(result[0]).toMatchObject({
      organization: '',
      description: '',
      tags: ['x', 'y'], // blanks, non-strings, and duplicates removed
    })
    expect(result[0].deadline).toBeUndefined()
    expect(result[0].location).toBeUndefined()
  })

  it('drops a non-array tags field to []', () => {
    const result = parse(
      JSON.stringify([{ title: 'A', url: 'https://a.com', tags: 'nope' }]),
    )
    expect(result[0].tags).toEqual([])
  })

  it('caps the number of candidates at max', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      title: `T${i}`,
      url: `https://x.com/${i}`,
    }))
    expect(parse(JSON.stringify(many), 5)).toHaveLength(5)
  })
})

describe('MockAI <-> opportunity parser round trip', () => {
  it('parses MockAI extraction output into query-flavoured candidates', async () => {
    // Proves prompt, mock, and parser agree on the wire format end-to-end.
    const request = buildOpportunityExtractionPrompt({
      query: 'machine learning',
      results: [{ title: 'r', url: 'https://r.com', snippet: 's' }],
    })
    const response = await new MockAI().complete(request)
    const result = parseOpportunityCandidates(response, EXTRACTED_OPPORTUNITY_COUNT)

    expect(result.length).toBeGreaterThan(0)
    // The mock echoes the query into the title, and emits well-formed url/type.
    expect(result[0].title).toContain('machine learning')
    expect(result[0].url).toMatch(/^https:\/\//)
  })
})
