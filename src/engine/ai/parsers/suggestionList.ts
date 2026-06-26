// engine/ai/parsers/suggestionList.ts — the shared primitive that turns a
// model's raw text into validated AISuggestion objects (Phase 5).
//
// PURE: no fetch, no DB, no store. Both suggestion features (milestones,
// subgoals) parse the SAME wire format — a JSON array of {title, description} —
// so the tolerant parsing lives here ONCE and each feature's parser is a thin,
// capped wrapper (engine/ai/parsers/milestones.ts, subgoals.ts). This mirrors
// computeCompletion underlying the domain progress functions: one primitive,
// domain-named call sites.
//
// THE CONTRACT THAT MATTERS: this NEVER throws. A model can return prose,
// markdown fences, truncated JSON, or nonsense; every one of those yields an
// empty array, not an exception, so a malformed reply degrades to "no
// suggestions" (the user adds items manually) instead of crashing a create flow.

import type { AIResponse, AISuggestion } from '@/engine/ai/types'

// Parse up to `max` suggestions from the model text. Order is preserved; items
// past the cap are dropped (defends against a runaway response).
export function parseSuggestionList(
  response: AIResponse,
  max: number,
): AISuggestion[] {
  const parsed = extractJsonArray(response.text)
  if (parsed === null) return []

  const suggestions: AISuggestion[] = []
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
    if (suggestions.length >= max) break
  }
  return suggestions
}

// Pull a JSON array out of arbitrary model text. Returns the parsed array on
// success, or null if no parseable array is present. Handles the two common
// deviations from the asked-for "bare array" format: markdown code fences and
// surrounding prose. Never throws — JSON.parse failures resolve to null.
//
// Exported because it is the genuinely shared low-level primitive: the discovery
// extraction parser (parsers/opportunities.ts) reads the SAME tolerant JSON-array
// format, just with richer per-item validation. Keeping this one extractor avoids
// duplicating the fence/prose-stripping logic in two places.
export function extractJsonArray(text: string): unknown[] | null {
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
