// engine/ai/prompts/intake.ts — build the model request for the Stage-0 INTAKE
// questions: the few goal-specific questions a planning coach asks BEFORE writing
// a strategy brief (Phase 10).
//
// PURE: no fetch, no DB, no store. Produces an AIRequest whose reply is a JSON
// array of question STRINGS; the matching parser (parsers/intake.ts) reads exactly
// that. This is the front of the Direction pipeline: the user answers these
// questions, the answers become IntakeExchange[], and buildStrategyBriefPrompt
// folds them into a sharper brief.
//
// WHY questions at all: the north-star ChatGPT transcript gave its value by
// INTERVIEWING first (country, budget, timeline, current level) — answers that
// completely change the plan. A fixed form can't adapt per goal; a model can.

import type { AIRequest, IntakeQuestionContext } from '@/engine/ai/types'
import {
  LIFEMAP_SYSTEM_PROMPT,
  renderUserContextLines,
  renderGoalContextLines,
} from '@/engine/ai/prompts/system'

// How many questions we ask for and the parser keeps. Kept low: a short, answerable
// interview beats an interrogation the user abandons. Exported so parser + tests share it.
export const MAX_INTAKE_QUESTIONS = 6

// The shared philosophy plus this feature's contract: ask the highest-leverage
// questions, and return a machine-parseable array of strings.
const SYSTEM_INSTRUCTION = [
  LIFEMAP_SYSTEM_PROMPT,
  'For this request, act as a planning coach preparing to write a strategy brief: ask the few highest-leverage intake questions whose answers would most change the plan for THIS specific goal.',
  `Ask at most ${MAX_INTAKE_QUESTIONS} questions, each concrete and answerable in a sentence or two.`,
  'Prefer questions that reveal constraints, priorities, and starting point — timeline pressure, budget, current level, what success really looks like. Never ask generic filler, and never ask something the context already answers.',
  'Respond with ONLY a JSON array of question strings.',
  'No prose, no markdown, no code fences around the array.',
].join(' ')

export function buildIntakePrompt(context: IntakeQuestionContext): AIRequest {
  const { goalTitle, goalDescription, goalCategory, targetDate, userContext, goalContext } =
    context

  const lines: string[] = [`Goal: ${goalTitle}`, `Category: ${goalCategory}`]
  if (goalDescription.trim().length > 0) {
    lines.push(`Goal description: ${goalDescription.trim()}`)
  }
  if (targetDate) lines.push(`Target date: ${targetDate}`)
  // Personalization: what we already know, so the model doesn't re-ask it.
  lines.push(...renderUserContextLines(userContext))
  lines.push(...renderGoalContextLines(goalContext))
  lines.push('Ask the intake questions for this goal.')

  return {
    system: SYSTEM_INSTRUCTION,
    messages: [{ role: 'user', content: lines.join('\n') }],
    // Deciding WHAT to ask is nuanced, tailoring-sensitive work — quality tier.
    tier: 'quality',
  }
}
