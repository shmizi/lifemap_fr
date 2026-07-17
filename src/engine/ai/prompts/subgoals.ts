// engine/ai/prompts/subgoals.ts — build the model request that asks for the
// major subgoals a goal breaks into (Phase 5).
//
// PURE: no fetch, no DB, no store. The sibling of prompts/milestones.ts, one
// level up the hierarchy: a goal -> its subgoals (the major parts it depends
// on), where a milestone prompt asks a subgoal -> its checkpoints. Output
// contract is the same shared {title, description} JSON array, parsed by the
// shared parseSuggestionList primitive via parsers/subgoals.ts.

import type { AIRequest, SubgoalSuggestionContext } from '@/engine/ai/types'
import {
  LIFEMAP_SYSTEM_PROMPT,
  renderUserContextLines,
  renderGoalContextLines,
} from '@/engine/ai/prompts/system'
import { renderStrategyBriefLines } from '@/engine/ai/prompts/strategyBrief'

// Defensive hard ceiling on subgoals accepted from one suggestion. The model is
// asked to recommend AS MANY as the goal genuinely needs (see the prompt), not a
// fixed count — this only stops a runaway reply from dumping dozens. Generous on
// purpose. Exported so the parser cap and tests share one value.
export const MAX_SUBGOAL_SUGGESTIONS = 12

// The shared planning philosophy (LIFEMAP_SYSTEM_PROMPT) plus this feature's
// output contract. Both are needed: the philosophy so suggestions are tailored
// and well-shaped, the contract so the reply is machine-parseable.
const SYSTEM_INSTRUCTION = [
  LIFEMAP_SYSTEM_PROMPT,
  'For this request, break a long-term personal goal into its major subgoals.',
  'A subgoal is a significant part the goal depends on, not a single task or milestone.',
  'Suggest as many subgoals as the goal genuinely needs to be fully covered — most goals need a handful (about 3 to 6), more only when the goal is genuinely broad, fewer when it is tight. Prefer the number that divides the goal cleanly; do not pad the list with filler, and do not split one part into several.',
  'Each needs a short title and one concise sentence describing what it involves.',
  'Respond with ONLY a JSON array of objects shaped {"title": string, "description": string}.',
  'No prose, no markdown, no code fences around the array.',
].join(' ')

export function buildSubgoalPrompt(context: SubgoalSuggestionContext): AIRequest {
  const {
    goalTitle,
    goalDescription,
    goalCategory,
    existingSubgoalTitles,
    userContext,
    goalContext,
    strategyBrief,
  } = context

  const lines: string[] = [
    `Goal: ${goalTitle}`,
    `Category: ${goalCategory}`,
  ]
  if (goalDescription.trim().length > 0) {
    lines.push(`Goal description: ${goalDescription.trim()}`)
  }
  // Personalization: who this is for and where they stand on the goal.
  lines.push(...renderUserContextLines(userContext))
  lines.push(...renderGoalContextLines(goalContext))
  // Phase 10: the Direction the subgoals must serve — the sharpened target and
  // ranked priorities from the goal's Strategy Brief (empty when none generated).
  lines.push(...renderStrategyBriefLines(strategyBrief))
  if (existingSubgoalTitles && existingSubgoalTitles.length > 0) {
    lines.push(
      `It already has these subgoals, do not repeat them: ${existingSubgoalTitles.join('; ')}`,
    )
  }
  lines.push('Suggest the subgoals for this goal.')

  return {
    system: SYSTEM_INSTRUCTION,
    messages: [{ role: 'user', content: lines.join('\n') }],
    // Decomposition is the nuanced, tailoring-sensitive step — use the quality tier.
    tier: 'quality',
  }
}
