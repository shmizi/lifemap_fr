// engine/ai/parsers/strategyBrief.ts — turn a model's raw text into a validated
// StrategyBrief (Phase 10).
//
// PURE: no fetch, no DB, no store. The single-OBJECT counterpart to
// parsers/suggestionList.ts (which reads an ARRAY): a goal has ONE strategy, so
// the brief prompt asks for one JSON object and this reads it.
//
// THE CONTRACT THAT MATTERS (same as every parser): this NEVER throws. A model can
// return prose, markdown fences, truncated JSON, or an object missing fields;
// every one of those yields `null` (a calm "no brief yet") — never an exception —
// so a malformed reply can never crash the Direction flow. `null` specifically
// means "no usable brief"; the caller falls back (keeps the plain goal, or retries).

import type { AIResponse, StrategyBrief, StrategyPriority } from '@/engine/ai/types'
import { MAX_BRIEF_PRIORITIES } from '@/engine/ai/prompts/strategyBrief'

export function parseStrategyBrief(response: AIResponse): StrategyBrief | null {
  const record = extractJsonObject(response.text)
  if (record === null) return null

  // A brief with no target is not a usable brief — that field is the whole point.
  const sharpenedTarget =
    typeof record.sharpenedTarget === 'string' ? record.sharpenedTarget.trim() : ''
  if (sharpenedTarget.length === 0) return null

  const theme = typeof record.theme === 'string' ? record.theme.trim() : ''

  // Priorities: keep only objects with a non-blank title; rationale is optional
  // (defaults to ''). Cap defends against a runaway list. Anything malformed is
  // skipped, never fatal.
  const priorities: StrategyPriority[] = []
  if (Array.isArray(record.priorities)) {
    for (const item of record.priorities) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
      const p = item as Record<string, unknown>
      const title = typeof p.title === 'string' ? p.title.trim() : ''
      if (title.length === 0) continue
      const rationale = typeof p.rationale === 'string' ? p.rationale.trim() : ''
      priorities.push({ title, rationale })
      if (priorities.length >= MAX_BRIEF_PRIORITIES) break
    }
  }

  // Notes: keep non-blank strings only; ignore any non-string entries.
  const notes: string[] = []
  if (Array.isArray(record.notes)) {
    for (const note of record.notes) {
      if (typeof note === 'string' && note.trim().length > 0) notes.push(note.trim())
    }
  }

  return { sharpenedTarget, theme, priorities, notes }
}

// Pull a JSON OBJECT out of arbitrary model text — the object-shaped sibling of
// extractJsonArray (parsers/suggestionList.ts). Slices from the first '{' to the
// last '}', which strips ```json fences and surrounding prose in one step. Returns
// the parsed record, or null when there is no parseable object. Never throws.
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null

  const candidate = text.slice(start, end + 1)
  try {
    const value: unknown = JSON.parse(candidate)
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}
