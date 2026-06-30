// engine/ai/prompts/milestones.ts — build the model request that asks for
// milestone suggestions for one subgoal (Phase 5).
//
// PURE: no fetch, no DB, no store. Given a MilestoneSuggestionContext it returns
// an AIRequest (system + user message). The matching parser
// (engine/ai/parsers/milestones.ts) is written to the EXACT output contract this
// prompt asks for — keep the two in lockstep: the prompt requests a JSON array
// of {title, description}, the parser expects precisely that.
//
// WHY pure & testable: the prompt is product-critical text. Unit tests assert it
// carries the subgoal/goal context and the output contract, so a careless edit
// that drops them is caught without any network call.

import type { AIRequest, MilestoneSuggestionContext } from '@/engine/ai/types'
import {
  LIFEMAP_SYSTEM_PROMPT,
  renderUserContextLines,
  renderGoalContextLines,
} from '@/engine/ai/prompts/system'

// How many checkpoints we ask the model to produce. Matches the parser's cap
// (see MAX_MILESTONE_SUGGESTIONS there) so prompt and parser agree on volume —
// small on purpose: milestones are a few meaningful checkpoints, not a task list
// (tasks live one level below). Exported so the parser and tests share one value.
export const SUGGESTED_MILESTONE_COUNT = 5

// The shared planning philosophy plus this feature's contract: milestones are
// ordered checkpoints, NOT tasks, and the response must be machine-parseable.
const SYSTEM_INSTRUCTION = [
  LIFEMAP_SYSTEM_PROMPT,
  'For this request, break a personal subgoal into a few meaningful milestones.',
  'A milestone is an ordered checkpoint that marks real progress, not a single task.',
  `Suggest at most ${SUGGESTED_MILESTONE_COUNT} milestones, in the order they should be reached.`,
  'Each needs a short title and one concise sentence describing what marks it done.',
  'Respond with ONLY a JSON array of objects shaped {"title": string, "description": string}.',
  'No prose, no markdown, no code fences around the array.',
].join(' ')

export function buildMilestonePrompt(
  context: MilestoneSuggestionContext,
): AIRequest {
  const {
    subgoalTitle,
    subgoalDescription,
    goalTitle,
    existingMilestoneTitles,
    userContext,
    goalContext,
  } = context

  // Lines are assembled conditionally so empty optional fields never inject a
  // dangling "Description:" with nothing after it (which would mislead the model).
  const lines: string[] = [
    `Goal: ${goalTitle}`,
    `Subgoal: ${subgoalTitle}`,
  ]
  if (subgoalDescription.trim().length > 0) {
    lines.push(`Subgoal description: ${subgoalDescription.trim()}`)
  }
  // Personalization: who this is for and where they stand on the parent goal.
  lines.push(...renderUserContextLines(userContext))
  lines.push(...renderGoalContextLines(goalContext))
  if (existingMilestoneTitles && existingMilestoneTitles.length > 0) {
    // Steer away from duplicating checkpoints the subgoal already has.
    lines.push(
      `It already has these milestones, do not repeat them: ${existingMilestoneTitles.join('; ')}`,
    )
  }
  lines.push('Suggest the milestones for this subgoal.')

  return {
    system: SYSTEM_INSTRUCTION,
    messages: [{ role: 'user', content: lines.join('\n') }],
    // Checkpoint decomposition is part of the nuanced roadmap step — quality tier.
    tier: 'quality',
  }
}
