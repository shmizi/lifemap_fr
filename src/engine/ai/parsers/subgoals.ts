// engine/ai/parsers/subgoals.ts — turn a model's raw text into validated
// SubgoalSuggestion objects (Phase 5).
//
// The counterpart of engine/ai/prompts/subgoals.ts. Tolerant parsing lives in
// the shared parseSuggestionList primitive (milestones and subgoals share the
// same {title, description} wire format); this is the subgoal-capped wrapper and,
// like the primitive, NEVER throws — a malformed reply yields [].

import type { AIResponse, SubgoalSuggestion } from '@/engine/ai/types'
import { parseSuggestionList } from '@/engine/ai/parsers/suggestionList'
import { SUGGESTED_SUBGOAL_COUNT } from '@/engine/ai/prompts/subgoals'

// Hard upper bound on accepted suggestions; shares the prompt's asked-for count.
export const MAX_SUBGOAL_SUGGESTIONS = SUGGESTED_SUBGOAL_COUNT

export function parseSubgoalSuggestions(
  response: AIResponse,
): SubgoalSuggestion[] {
  return parseSuggestionList(response, MAX_SUBGOAL_SUGGESTIONS)
}
