// engine/ai/parsers/milestones.ts — turn a model's raw text into validated
// MilestoneSuggestion objects (Phase 5).
//
// The counterpart of engine/ai/prompts/milestones.ts. The tolerant parsing
// itself lives in the shared parseSuggestionList primitive (milestones and
// subgoals share the same {title, description} wire format); this file is just
// the milestone-capped wrapper. Like the primitive, it NEVER throws — a
// malformed reply yields [], which the store treats as a calm "no suggestions".

import type { AIResponse, MilestoneSuggestion } from '@/engine/ai/types'
import { parseSuggestionList } from '@/engine/ai/parsers/suggestionList'
import { SUGGESTED_MILESTONE_COUNT } from '@/engine/ai/prompts/milestones'

// Hard upper bound on accepted suggestions, regardless of how many the model
// returns. Shares the prompt's asked-for count so the two stay in lockstep — a
// well-behaved model returns at most this many anyway; the cap defends against a
// runaway response.
export const MAX_MILESTONE_SUGGESTIONS = SUGGESTED_MILESTONE_COUNT

export function parseMilestoneSuggestions(
  response: AIResponse,
): MilestoneSuggestion[] {
  return parseSuggestionList(response, MAX_MILESTONE_SUGGESTIONS)
}
