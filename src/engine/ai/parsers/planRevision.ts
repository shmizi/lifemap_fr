// engine/ai/parsers/planRevision.ts — turn a model's raw text into a validated
// PlanRevisionProposal. The counterpart of prompts/planRevision.ts.
//
// PURE and NEVER throws (the parser contract): prose, fences, truncated JSON or a
// malformed object all yield `null` — a calm "no proposal" — so a bad reply can
// never crash the revision flow. Reuses the object extractor the Strategy Brief
// parser owns.
//
// ONE IMPORTANT DIFFERENCE from parseScopeCut: an unknown or missing action is
// DROPPED here, not degraded to a default. The scope-cut parser can safely fall back
// to "compress" because compress is advisory — it changes nothing on its own. Every
// action here mutates the plan, so guessing at an ambiguous one risks deleting work
// the model never asked to delete. A suggestion we can't read is not a suggestion.

import type {
  AIResponse,
  PlanRevisionAction,
  PlanRevisionProposal,
  PlanRevisionSuggestion,
} from '@/engine/ai/types'
import { extractJsonObject } from '@/engine/ai/parsers/strategyBrief'
import { MAX_PLAN_REVISION_SUGGESTIONS } from '@/engine/ai/prompts/planRevision'

const VALID_ACTIONS: ReadonlySet<PlanRevisionAction> = new Set<PlanRevisionAction>([
  'drop',
  'defer',
  'replan',
])

export function parsePlanRevision(response: AIResponse): PlanRevisionProposal | null {
  const record = extractJsonObject(response.text)
  if (record === null) return null

  const summary = typeof record.summary === 'string' ? record.summary.trim() : ''

  const suggestions: PlanRevisionSuggestion[] = []
  if (Array.isArray(record.suggestions)) {
    for (const item of record.suggestions) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
      const s = item as Record<string, unknown>

      const target = typeof s.target === 'string' ? s.target.trim() : ''
      if (target.length === 0) continue // nothing to act on

      // Drop rather than guess — see the note at the top of this file.
      if (typeof s.action !== 'string') continue
      const action = s.action as PlanRevisionAction
      if (!VALID_ACTIONS.has(action)) continue

      const rationale = typeof s.rationale === 'string' ? s.rationale.trim() : ''
      suggestions.push({ target, action, rationale })
      if (suggestions.length >= MAX_PLAN_REVISION_SUGGESTIONS) break
    }
  }

  // A summary with NO suggestions is a valid, meaningful answer here ("nothing in
  // the plan is invalidated by this") — unlike a scope cut, where it would be a
  // non-answer. Only a reply with neither is unusable.
  if (summary.length === 0 && suggestions.length === 0) return null
  return { summary, suggestions }
}
