// engine/ai/parsers/scopeCut.ts — turn a model's raw text into a validated
// ScopeCutProposal (Phase 10). The counterpart of prompts/scopeCut.ts.
//
// PURE and NEVER throws (same contract as every parser): a model can return prose,
// fences, truncated JSON, or a malformed object, and every one yields `null` (a calm
// "no proposal") — never an exception — so a failed reply can't crash the escalation
// flow. Reuses the object extractor the Strategy Brief parser already owns.

import type {
  AIResponse,
  ScopeCutAction,
  ScopeCutProposal,
  ScopeCutSuggestion,
} from '@/engine/ai/types'
import { extractJsonObject } from '@/engine/ai/parsers/strategyBrief'
import { MAX_SCOPE_CUT_SUGGESTIONS } from '@/engine/ai/prompts/scopeCut'

const VALID_ACTIONS: ReadonlySet<ScopeCutAction> = new Set<ScopeCutAction>([
  'cut',
  'compress',
  'defer',
])

export function parseScopeCut(response: AIResponse): ScopeCutProposal | null {
  const record = extractJsonObject(response.text)
  if (record === null) return null

  const summary = typeof record.summary === 'string' ? record.summary.trim() : ''

  const suggestions: ScopeCutSuggestion[] = []
  if (Array.isArray(record.suggestions)) {
    for (const item of record.suggestions) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
      const s = item as Record<string, unknown>
      const target = typeof s.target === 'string' ? s.target.trim() : ''
      if (target.length === 0) continue // a suggestion with no target is meaningless
      // An unknown/missing action degrades to the gentlest choice ("compress")
      // rather than dropping the whole suggestion.
      const action: ScopeCutAction =
        typeof s.action === 'string' && VALID_ACTIONS.has(s.action as ScopeCutAction)
          ? (s.action as ScopeCutAction)
          : 'compress'
      const rationale = typeof s.rationale === 'string' ? s.rationale.trim() : ''
      suggestions.push({ target, action, rationale })
      if (suggestions.length >= MAX_SCOPE_CUT_SUGGESTIONS) break
    }
  }

  // A proposal with neither a summary nor a single suggestion is not usable.
  if (summary.length === 0 && suggestions.length === 0) return null
  return { summary, suggestions }
}
