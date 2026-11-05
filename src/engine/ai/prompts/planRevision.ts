// engine/ai/prompts/planRevision.ts — build the model request that reconciles an
// EXISTING roadmap with something that has changed. PURE: no fetch/DB/store.
//
// The sibling of prompts/scopeCut.ts, and deliberately shaped like it (same
// propose → review → apply contract), but triggered by a DIFFERENT thing. The scope
// cut asks "the date is at risk, what do we give up?" — a question about capacity.
// This asks "the situation moved, what is no longer the right work?" — a question
// about relevance. A plan can be perfectly on schedule and still be largely wrong.
//
// The framing that matters: the model is told to change as LITTLE as possible. A
// change note is not licence to redesign the roadmap, and a coach that rewrites
// everything whenever the user mentions something is worse than useless — the user
// stops telling it things. So the ask is explicitly for the parts the change
// genuinely invalidates, and for silence when it invalidates nothing.

import type { AIRequest, PlanRevisionContext } from '@/engine/ai/types'
import {
  LIFEMAP_SYSTEM_PROMPT,
  renderUserContextLines,
  renderGoalContextLines,
} from '@/engine/ai/prompts/system'
import { renderStrategyBriefLines } from '@/engine/ai/prompts/strategyBrief'
import { renderDigestLines } from '@/engine/review/computeRoadmapDigest'

// Defensive cap on accepted suggestions, mirroring MAX_SCOPE_CUT_SUGGESTIONS. A
// revision is a few targeted edits; a long list means the model redesigned the plan
// instead of reconciling it. Exported so the parser and tests share one value.
export const MAX_PLAN_REVISION_SUGGESTIONS = 6

const SYSTEM_INSTRUCTION = [
  LIFEMAP_SYSTEM_PROMPT,
  'Something has changed in this person\'s situation since their roadmap was generated. Decide which parts of the EXISTING plan the change makes invalid, and what should happen to each.',
  'For each affected part choose an action: "drop" (it is no longer worth doing at all), "defer" (still worth doing, but not now — move it off the schedule), or "replan" (still the right goal, but the specific work is now wrong and should be planned again).',
  'Change as LITTLE as possible. Only name parts the change genuinely invalidates — not parts that are merely behind, imperfect, or that you would have planned differently. Work already completed is history: never propose undoing it.',
  'If the change does not invalidate anything, return an empty suggestions array and say so in the summary. That is a correct and useful answer.',
  'Be concrete: name the track or phase exactly as it appears in the plan below.',
  'Respond with ONLY a JSON object shaped {"summary": string, "suggestions": [{"target": string, "action": "drop"|"defer"|"replan", "rationale": string}]}. The summary is one or two sentences on how the plan should read differently now.',
  'No prose, no markdown, no code fences around the object.',
].join(' ')

export function buildPlanRevisionPrompt(context: PlanRevisionContext): AIRequest {
  const {
    goalTitle,
    goalDescription,
    goalCategory,
    targetDate,
    changeNote,
    userContext,
    goalContext,
    strategyBrief,
    digest,
  } = context

  const lines: string[] = [`Goal: ${goalTitle}`, `Category: ${goalCategory}`]
  if (goalDescription.trim().length > 0) {
    lines.push(`Goal description: ${goalDescription.trim()}`)
  }
  if (targetDate) {
    lines.push(`Target date: ${targetDate}`)
  }

  // The user's own words, labelled unmistakably — this is the input the whole
  // request turns on, and it must not read as just more background context.
  lines.push('', `What has changed: ${changeNote.trim()}`, '')

  // Standing personalization, the Direction the plan serves, and the structure that
  // exists to be reconciled against the change.
  lines.push(...renderUserContextLines(userContext))
  lines.push(...renderGoalContextLines(goalContext))
  lines.push(...renderStrategyBriefLines(strategyBrief))
  // The digest IS the plan being reconciled — without it the model has nothing
  // concrete to name, so a goal with no structure yet simply has nothing to revise.
  if (digest) lines.push(...renderDigestLines(digest))
  lines.push('Reconcile the plan with what changed.')

  return {
    system: SYSTEM_INSTRUCTION,
    messages: [{ role: 'user', content: lines.join('\n') }],
  }
}
