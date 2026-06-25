// engine/ai/parsers/milestones.ts — turn a model's raw text into validated
// MilestoneSuggestion objects (Phase 5).
//
// PURE: no fetch, no DB, no store. The counterpart of
// engine/ai/prompts/milestones.ts — it expects the JSON array that prompt asks
// for, but is written to TOLERATE the reality that models do not always comply.
//
// THE CONTRACT THAT MATTERS: this function NEVER throws. A model can return
// prose, markdown fences, truncated JSON, or nonsense; every one of those yields
// an empty array, not an exception. The store treats "no suggestions" as a calm,
// expected outcome (the user just adds milestones manually), so a malformed
// response must degrade to that, never crash the create-subgoal flow. This is
// the whole reason parsing is its own pure, unit-tested unit.

import type { AIResponse, MilestoneSuggestion } from '@/engine/ai/types'
import { SUGGESTED_MILESTONE_COUNT } from '@/engine/ai/prompts/milestones'

// Hard upper bound on accepted suggestions, regardless of how many the model
// returns. Shares the prompt's asked-for count so the two stay in lockstep — a
// well-behaved model returns at most this many anyway; the cap defends against a
// runaway response.
export const MAX_MILESTONE_SUGGESTIONS = SUGGESTED_MILESTONE_COUNT

export function parseMilestoneSuggestions(
  response: AIResponse,
): MilestoneSuggestion[] {
  const parsed = extractJsonArray(response.text)
  if (parsed === null) return []

  const suggestions: MilestoneSuggestion[] = []
  for (const item of parsed) {
    // Each element must be an object with a non-blank string title. Anything
    // else (string, null, number, titleless object) is skipped, not fatal.
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      continue
    }
    const record = item as Record<string, unknown>
    const title = typeof record.title === 'string' ? record.title.trim() : ''
    if (title.length === 0) continue

    // Description is optional; keep it only if it is a non-blank string. Any
    // extra fields the model invented are ignored — we read just title/description.
    const rawDescription = record.description
    const description =
      typeof rawDescription === 'string' && rawDescription.trim().length > 0
        ? rawDescription.trim()
        : undefined

    suggestions.push(description ? { title, description } : { title })
    if (suggestions.length >= MAX_MILESTONE_SUGGESTIONS) break
  }
  return suggestions
}

// Pull a JSON array out of arbitrary model text. Returns the parsed array on
// success, or null if no parseable array is present. Handles the two common
// deviations from the asked-for "bare array" format: markdown code fences and
// surrounding prose. Never throws — JSON.parse failures resolve to null.
function extractJsonArray(text: string): unknown[] | null {
  // Slice from the first '[' to the last ']' — this strips ```json fences and
  // any leading/trailing prose in one step. If either bracket is missing there
  // is no array to read.
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return null

  const candidate = text.slice(start, end + 1)
  try {
    const value: unknown = JSON.parse(candidate)
    return Array.isArray(value) ? value : null
  } catch {
    return null
  }
}
