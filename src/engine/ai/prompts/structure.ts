// engine/ai/prompts/structure.ts — build the model request for a goal's STRUCTURE:
// the parallel tracks it needs and the ordered phases each track moves through
// (Phase 10, Stage 2). PURE: no fetch, no DB, no store.
//
// This is the "model scopes itself" stage. Unlike the old subgoal decomposition
// (which asked for a flat list), this asks the model to reason out BOTH how many
// tracks the goal needs AND how many phases each track passes through — reading the
// Strategy Brief so the shape serves the Direction, not just the title. It emits an
// UNDATED skeleton only: no day-to-day tasks, no dates (those are Stage 3, expanded
// one phase at a time). Track = Subgoal, Phase = Milestone.

import type { AIRequest, StructureContext } from '@/engine/ai/types'
import {
  LIFEMAP_SYSTEM_PROMPT,
  renderUserContextLines,
  renderGoalContextLines,
} from '@/engine/ai/prompts/system'
import { renderStrategyBriefLines } from '@/engine/ai/prompts/strategyBrief'

// Defensive hard ceilings on an accepted structure. The model is asked to decide
// the counts itself (see the prompt), not hit a fixed number — these only stop a
// runaway reply from dumping dozens. Generous on purpose. Exported so the parser
// caps and tests share one value (same pattern as MAX_SUBGOAL_SUGGESTIONS).
export const MAX_STRUCTURE_TRACKS = 12
export const MAX_PHASES_PER_TRACK = 8

const SYSTEM_INSTRUCTION = [
  LIFEMAP_SYSTEM_PROMPT,
  'For this request, lay out the STRUCTURE of a long-term goal: the parallel tracks it needs, and the ordered phases each track moves through.',
  'A track is a major workstream the goal depends on (it becomes a subgoal). A phase is a stage within a track that should be reached before the next one (it becomes a milestone).',
  'Decide how many tracks the goal genuinely needs, and how many phases each track passes through — most goals have a few tracks, each moving through a few phases; use more only when the goal is genuinely broad, fewer when it is tight. Order the phases so each builds on the one before. Do not pad, and do not split one part into several.',
  'This is the UNDATED skeleton only: do NOT schedule anything, assign dates, or list day-to-day tasks — those come later, one phase at a time.',
  'Give each track and each phase a short title and one concise sentence describing what it involves.',
  'Respond with ONLY a JSON array of tracks, each shaped {"title": string, "description": string, "phases": [{"title": string, "description": string}]}.',
  'No prose, no markdown, no code fences around the array.',
].join(' ')

export function buildStructurePrompt(context: StructureContext): AIRequest {
  const {
    goalTitle,
    goalDescription,
    goalCategory,
    targetDate,
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
  if (targetDate) {
    lines.push(`Target date: ${targetDate}`)
  }
  // Personalization: who this is for and where they stand on the goal.
  lines.push(...renderUserContextLines(userContext))
  lines.push(...renderGoalContextLines(goalContext))
  // Phase 10: the Direction the structure must serve — the sharpened target and
  // ranked priorities from the goal's Strategy Brief (empty when none generated).
  lines.push(...renderStrategyBriefLines(strategyBrief))
  lines.push('Lay out the structure for this goal.')

  return {
    system: SYSTEM_INSTRUCTION,
    messages: [{ role: 'user', content: lines.join('\n') }],
    // Scoping the whole arc is the nuanced, tailoring-sensitive step — quality tier.
    tier: 'quality',
  }
}
