import { describe, expect, it } from 'vitest'
import {
  buildOpportunityExtractionPrompt,
  EXTRACTED_OPPORTUNITY_COUNT,
} from '@/engine/ai/prompts/opportunities'
import type { RawSearchResult } from '@/engine/ai/types'

const results: RawSearchResult[] = [
  { title: 'ML Internship', url: 'https://x.com/ml', snippet: 'A summer ML internship.' },
  { title: 'AI Scholarship', url: 'https://x.com/ai', snippet: '' },
]

describe('buildOpportunityExtractionPrompt', () => {
  it('puts the query on a Query: line (the mock branch marker)', () => {
    const req = buildOpportunityExtractionPrompt({ query: 'machine learning', results })
    expect(req.messages[0].content).toMatch(/^Query: machine learning$/m)
  })

  it('lists each result title and url', () => {
    const content = buildOpportunityExtractionPrompt({ query: 'ml', results })
      .messages[0].content
    expect(content).toContain('ML Internship')
    expect(content).toContain('https://x.com/ml')
    expect(content).toContain('AI Scholarship')
    expect(content).toContain('https://x.com/ai')
  })

  it('includes a non-blank snippet but omits a blank one', () => {
    const content = buildOpportunityExtractionPrompt({ query: 'ml', results })
      .messages[0].content
    expect(content).toContain('A summer ML internship.')
  })

  it('asks for a JSON array, the allowed types, and the cap in the system text', () => {
    const req = buildOpportunityExtractionPrompt({ query: 'x', results: [] })
    expect(req.system).toMatch(/JSON array/i)
    expect(req.system).toContain('internship')
    expect(req.system).toContain(String(EXTRACTED_OPPORTUNITY_COUNT))
  })
})
