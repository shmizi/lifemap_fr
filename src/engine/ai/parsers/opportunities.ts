// engine/ai/parsers/opportunities.ts — turn the model's raw text into validated
// OpportunityCandidate objects (Phase 6).
//
// PURE: no fetch, no DB, no store. The counterpart of prompts/opportunities.ts.
// Like the suggestion parsers it NEVER throws — malformed model output yields [],
// a calm "found nothing" rather than a crashed discovery run. It validates MORE
// than parseSuggestionList because an opportunity has more fields and a typed
// `type` enum: each candidate must carry a title AND a url (a nameless or
// unlinkable result is unusable); `type` is coerced to the canonical set (unknown
// -> 'other', never dropped); tags are sanitised to a clean string list. It reuses
// the shared tolerant array extractor from suggestionList.

import type { AIResponse, OpportunityCandidate } from '@/engine/ai/types'
import type { OpportunityType } from '@/core/types'
import { extractJsonArray } from '@/engine/ai/parsers/suggestionList'

const VALID_TYPES: ReadonlySet<string> = new Set<OpportunityType>([
  'internship',
  'hackathon',
  'scholarship',
  'conference',
  'competition',
  'program',
  'other',
])

// Parse up to `max` opportunity candidates from the model text. Order preserved;
// items past the cap are dropped (defends against a runaway response).
export function parseOpportunityCandidates(
  response: AIResponse,
  max: number,
): OpportunityCandidate[] {
  const parsed = extractJsonArray(response.text)
  if (parsed === null) return []

  const candidates: OpportunityCandidate[] = []
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const record = item as Record<string, unknown>

    // Title and url are REQUIRED — a result with neither a name nor a link cannot
    // be shown or opened, so it is skipped (not fatal).
    const title = asString(record.title)
    const url = asString(record.url)
    if (title.length === 0 || url.length === 0) continue

    candidates.push({
      type: coerceType(record.type),
      title,
      organization: asString(record.organization),
      description: asString(record.description),
      url,
      deadline: asOptionalString(record.deadline),
      location: asOptionalString(record.location),
      tags: coerceTags(record.tags),
    })
    if (candidates.length >= max) break
  }
  return candidates
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asOptionalString(value: unknown): string | undefined {
  const s = asString(value)
  return s.length > 0 ? s : undefined
}

// An unrecognised or missing type degrades to 'other' rather than dropping the
// whole candidate — the item is still a real opportunity, just unclassified.
function coerceType(value: unknown): OpportunityType {
  return typeof value === 'string' && VALID_TYPES.has(value)
    ? (value as OpportunityType)
    : 'other'
}

// Keep only non-blank string tags, de-duplicated, order preserved. A non-array
// (or absent) tags field yields [].
function coerceTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const tags: string[] = []
  for (const entry of value) {
    const tag = asString(entry)
    if (tag.length > 0 && !tags.includes(tag)) tags.push(tag)
  }
  return tags
}
