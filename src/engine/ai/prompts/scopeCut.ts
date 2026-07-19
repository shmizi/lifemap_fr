// engine/ai/prompts/scopeCut.ts — build the model request that proposes a SCOPE CUT
// for a goal that is behind on a HARD deadline (Phase 10). PURE: no fetch/DB/store.
//
// The escalation branch: a SOFT deadline just reschedules mechanically (pure engine,
// no AI). A HARD deadline can't move, so when the goal is projected to miss it,
// rescheduling alone can't help — the coach must propose giving up or shrinking
// scope, and the USER approves. This builder frames that ask; it reads the Strategy
// Brief (what to protect) and the roadmap digest (what exists to trim) so the cut
// serves the strategy instead of hacking at the plan blindly.

import type { AIRequest, ScopeCutContext } from '@/engine/ai/types'
import {
  LIFEMAP_SYSTEM_PROMPT,
  renderUserContextLines,
  renderGoalContextLines,
} from '@/engine/ai/prompts/system'
import { renderStrategyBriefLines } from '@/engine/ai/prompts/strategyBrief'
import { renderDigestLines } from '@/engine/review/computeRoadmapDigest'

// Defensive cap on accepted suggestions — a scope cut is a few decisive moves, not a
// long list. Exported so the parser cap and tests share one value.
export const MAX_SCOPE_CUT_SUGGESTIONS = 6

const SYSTEM_INSTRUCTION = [
  LIFEMAP_SYSTEM_PROMPT,
  'This goal is BEHIND on a HARD deadline that cannot move, so rescheduling alone cannot make the plan fit. Propose how to TRIM SCOPE so the goal can still land on time.',
  'Protect what matters most (per the strategy) and give up the rest. For each part you would change, choose an action: "cut" (drop it entirely), "compress" (keep it but do noticeably less), or "defer" (finish it after the deadline).',
  'Propose the FEWEST changes that make the plan realistically fit — never trim everything, and never touch what the strategy says is essential. Be concrete: name the track or phase you mean.',
  'Respond with ONLY a JSON object shaped {"summary": string, "suggestions": [{"target": string, "action": "cut"|"compress"|"defer", "rationale": string}]}. The summary is one or two sentences on the overall reframe.',
  'No prose, no markdown, no code fences around the object.',
].join(' ')

export function buildScopeCutPrompt(context: ScopeCutContext): AIRequest {
  const {
    goalTitle,
    goalDescription,
    goalCategory,
    targetDate,
    behindSummary,
    userContext,
    goalContext,
    strategyBrief,
    digest,
  } = context

  const lines: string[] = [
    `Goal: ${goalTitle}`,
    `Category: ${goalCategory}`,
  ]
  if (goalDescription.trim().length > 0) {
    lines.push(`Goal description: ${goalDescription.trim()}`)
  }
  if (targetDate) {
    lines.push(`Hard deadline: ${targetDate}`)
  }
  if (behindSummary.trim().length > 0) {
    lines.push(`Status: ${behindSummary.trim()}`)
  }
  // Personalization + the Direction to protect + the structure available to trim.
  lines.push(...renderUserContextLines(userContext))
  lines.push(...renderGoalContextLines(goalContext))
  lines.push(...renderStrategyBriefLines(strategyBrief))
  if (digest) lines.push(...renderDigestLines(digest))
  lines.push('Propose the scope cut.')

  return {
    system: SYSTEM_INSTRUCTION,
    messages: [{ role: 'user', content: lines.join('\n') }],
    // A scope cut is a nuanced Layer-1 (Direction) judgement — use the quality tier.
    tier: 'quality',
  }
}
