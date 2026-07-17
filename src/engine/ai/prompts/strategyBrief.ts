// engine/ai/prompts/strategyBrief.ts — build the model request for a goal's
// STRATEGY BRIEF, the Direction-layer output that precedes any task breakdown
// (Phase 10), plus the renderer that splices a stored brief back into downstream
// prompts.
//
// PURE: no fetch, no DB, no store. Like the Phase 5 builders, this PRODUCES an
// AIRequest and its matching parser (parsers/strategyBrief.ts) is written to the
// EXACT output contract asked for here — keep the two in lockstep. The difference
// from the suggestion builders: the reply is a single JSON OBJECT (the brief),
// not an array, because a goal has ONE strategy.
//
// WHY a brief at all: it is the spine of the Phase 10 pipeline. Generated once and
// stored, then rendered (renderStrategyBriefLines) into the later structure /
// schedule / check-in prompts, so every stage plans against the SAME strategy
// instead of re-deriving it — and its compact, ~constant size is what keeps the
// rolling generation cost flat over a long-running goal.

import type { AIRequest, StrategyBrief, StrategyBriefContext } from '@/engine/ai/types'
import {
  LIFEMAP_SYSTEM_PROMPT,
  renderUserContextLines,
  renderGoalContextLines,
} from '@/engine/ai/prompts/system'

// How many priorities we ask for and the parser keeps. Small on purpose: a brief
// ranks a handful of high-leverage focuses, not an exhaustive list. Exported so
// the parser cap and tests share one value (same pattern as MAX_SUBGOAL_SUGGESTIONS).
export const MAX_BRIEF_PRIORITIES = 6

// The shared planning philosophy plus this feature's contract: act as a coach
// FIRST (direction before tasks), and return a single machine-parseable object.
const SYSTEM_INSTRUCTION = [
  LIFEMAP_SYSTEM_PROMPT,
  'For this request, act as a planning coach BEFORE any task breakdown: read the goal and the person, and write a short strategy brief that gives direction.',
  'Sharpen a vague goal into one concrete, honest target statement the person can aim at.',
  'Name a guiding theme only if one genuinely fits the work; otherwise return an empty string for it.',
  `Rank at most ${MAX_BRIEF_PRIORITIES} priorities by leverage — what matters MOST first — each with a one-line reason it earns that rank.`,
  'Capture the real tradeoffs, constraints, and decisions as short notes; never invent facts the person did not give you.',
  'Respond with ONLY a JSON object shaped {"sharpenedTarget": string, "theme": string, "priorities": [{"title": string, "rationale": string}], "notes": [string]}.',
  'No prose, no markdown, no code fences around the object.',
].join(' ')

export function buildStrategyBriefPrompt(context: StrategyBriefContext): AIRequest {
  const {
    goalTitle,
    goalDescription,
    goalCategory,
    targetDate,
    intake,
    userContext,
    goalContext,
  } = context

  const lines: string[] = [`Goal: ${goalTitle}`, `Category: ${goalCategory}`]
  if (goalDescription.trim().length > 0) {
    lines.push(`Goal description: ${goalDescription.trim()}`)
  }
  if (targetDate) lines.push(`Target date: ${targetDate}`)
  // Personalization: who this is for and where they stand on the goal.
  lines.push(...renderUserContextLines(userContext))
  lines.push(...renderGoalContextLines(goalContext))
  // The intake conversation (Stage 0), when it exists, is the richest signal — the
  // person's own answers to goal-specific questions. Rendered as plain Q/A lines.
  if (intake && intake.length > 0) {
    lines.push('Intake conversation:')
    for (const ex of intake) {
      const q = ex.question.trim()
      const a = ex.answer.trim()
      if (q.length > 0 && a.length > 0) lines.push(`Q: ${q}`, `A: ${a}`)
    }
  }
  lines.push('Write the strategy brief for this goal.')

  return {
    system: SYSTEM_INSTRUCTION,
    messages: [{ role: 'user', content: lines.join('\n') }],
    // Direction is the most nuanced, reasoning-heavy step of the whole pipeline.
    tier: 'quality',
  }
}

// Render a STORED brief into labelled lines for a downstream prompt's user message
// (structure / schedule / check-in). Returns [] for an absent brief so a builder
// can splice unconditionally — the same shape as renderUserContextLines. The line
// labels ("Strategy — ...") deliberately AVOID the MockAI branch markers
// ("Goal:", "Subgoal:", "Query:", "Days to plan:"), so injecting the brief never
// changes which mock template a request resolves to.
export function renderStrategyBriefLines(brief?: StrategyBrief): string[] {
  if (!brief) return []
  const lines: string[] = []

  if (brief.sharpenedTarget.trim().length > 0) {
    lines.push(`Strategy — target: ${brief.sharpenedTarget.trim()}`)
  }
  if (brief.theme.trim().length > 0) {
    lines.push(`Strategy — theme: ${brief.theme.trim()}`)
  }

  const rankedLines: string[] = []
  brief.priorities.forEach((p) => {
    const title = p.title.trim()
    if (title.length === 0) return
    const rationale = p.rationale.trim()
    rankedLines.push(
      rationale.length > 0
        ? `${rankedLines.length + 1}. ${title} — ${rationale}`
        : `${rankedLines.length + 1}. ${title}`,
    )
  })
  if (rankedLines.length > 0) {
    lines.push('Strategy — priorities (most important first):', ...rankedLines)
  }

  for (const note of brief.notes) {
    if (note.trim().length > 0) lines.push(`Strategy — note: ${note.trim()}`)
  }
  return lines
}
