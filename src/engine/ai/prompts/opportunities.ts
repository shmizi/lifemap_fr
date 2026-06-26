// engine/ai/prompts/opportunities.ts — build the model request that EXTRACTS
// structured opportunities from raw web search results (Phase 6).
//
// PURE: no fetch, no DB, no store. The search provider (services/opportunities)
// supplies the raw results; this turns them into a prompt asking the model to
// return a JSON array of structured opportunities. The matching parser is
// parsers/opportunities.ts. Relevance scoring is a SEPARATE pure concern
// (engine/discovery/scoreRelevance), done by the store AFTER parsing — this
// prompt only asks the model to STRUCTURE results, never to judge relevance.

import type { AIRequest, OpportunityExtractionContext } from '@/engine/ai/types'

// Upper bound on how many opportunities we ask the model to extract from one batch
// of results. Exported so the parser cap and tests share the number.
export const EXTRACTED_OPPORTUNITY_COUNT = 8

// The canonical opportunity types, named in the prompt so the model classifies
// into the set the app stores. Anything else the parser maps to 'other'.
const ALLOWED_TYPES =
  'internship, hackathon, scholarship, conference, competition, program, other'

const SYSTEM_INSTRUCTION = [
  'You extract real-world opportunities from web search results.',
  'An opportunity is a concrete thing a person can apply to or take part in:',
  'an internship, hackathon, scholarship, conference, competition, or program.',
  `Classify each into exactly one type from: ${ALLOWED_TYPES}.`,
  `Extract at most ${EXTRACTED_OPPORTUNITY_COUNT} opportunities; skip results that are not opportunities.`,
  'For each give: type, title, organization, a one-sentence description, the url,',
  'an optional deadline (YYYY-MM-DD), an optional location, and a few short topical tags.',
  'Respond with ONLY a JSON array of objects shaped',
  '{"type": string, "title": string, "organization": string, "description": string,',
  '"url": string, "deadline": string, "location": string, "tags": string[]}.',
  'Omit deadline/location when unknown. No prose, no markdown, no code fences.',
].join(' ')

export function buildOpportunityExtractionPrompt(
  context: OpportunityExtractionContext,
): AIRequest {
  const { query, results } = context

  // "Query:" is the line that uniquely identifies an extraction prompt to the
  // mock (no other prompt carries it); keep it first.
  const lines: string[] = [`Query: ${query}`, '', 'Search results:']
  results.forEach((result, i) => {
    lines.push(`${i + 1}. ${result.title}`)
    lines.push(`   URL: ${result.url}`)
    if (result.snippet.trim().length > 0) {
      lines.push(`   ${result.snippet.trim()}`)
    }
  })
  lines.push('', 'Extract the opportunities from these results.')

  return {
    system: SYSTEM_INSTRUCTION,
    messages: [{ role: 'user', content: lines.join('\n') }],
  }
}
