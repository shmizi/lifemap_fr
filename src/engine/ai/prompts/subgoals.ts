// engine/ai/prompts/subgoals.ts — build the model request that asks for the
// major subgoals a goal breaks into (Phase 5).
//
// PURE: no fetch, no DB, no store. The sibling of prompts/milestones.ts, one
// level up the hierarchy: a goal -> its subgoals (the major parts it depends
// on), where a milestone prompt asks a subgoal -> its checkpoints. Output
// contract is the same shared {title, description} JSON array, parsed by the
// shared parseSuggestionList primitive via parsers/subgoals.ts.

import type { AIRequest, SubgoalSuggestionContext } from '@/engine/ai/types'

// How many subgoals we ask for. Kept small: a goal breaks into a handful of
// major parts, not a long list. Exported so the parser cap and tests share it.
export const SUGGESTED_SUBGOAL_COUNT = 5

const SYSTEM_INSTRUCTION = [
  'You help break a long-term personal goal into its major subgoals.',
  'A subgoal is a significant part the goal depends on, not a single task or milestone.',
  `Suggest at most ${SUGGESTED_SUBGOAL_COUNT} subgoals that together cover the goal.`,
  'Each needs a short title and one concise sentence describing what it involves.',
  'Respond with ONLY a JSON array of objects shaped {"title": string, "description": string}.',
  'No prose, no markdown, no code fences around the array.',
].join(' ')

export function buildSubgoalPrompt(context: SubgoalSuggestionContext): AIRequest {
  const { goalTitle, goalDescription, goalCategory, existingSubgoalTitles } =
    context

  const lines: string[] = [
    `Goal: ${goalTitle}`,
    `Category: ${goalCategory}`,
  ]
  if (goalDescription.trim().length > 0) {
    lines.push(`Goal description: ${goalDescription.trim()}`)
  }
  if (existingSubgoalTitles && existingSubgoalTitles.length > 0) {
    lines.push(
      `It already has these subgoals, do not repeat them: ${existingSubgoalTitles.join('; ')}`,
    )
  }
  lines.push('Suggest the subgoals for this goal.')

  return {
    system: SYSTEM_INSTRUCTION,
    messages: [{ role: 'user', content: lines.join('\n') }],
  }
}
