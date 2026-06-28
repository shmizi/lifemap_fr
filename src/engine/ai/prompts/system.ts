// engine/ai/prompts/system.ts — the shared decomposition philosophy every AI
// prompt carries, plus the renderers that turn personalization context into
// prompt lines (Phase 9).
//
// PURE: no fetch, no DB, no store, no React. Just strings. The three feature
// prompt builders (milestones / subgoals / dailyPlan) prepend LIFEMAP_SYSTEM_PROMPT
// to their own feature-specific rules, and splice the rendered context lines into
// their user message — so a single place owns "how LifeMap thinks about planning"
// and "how a person's context is described to the model".
//
// IMPORTANT: the context line LABELS deliberately avoid the markers MockAI branches
// on ("Goal:", "Subgoal:", "Query:", "Days to plan:") so adding context never
// changes which mock template a request resolves to.

import type { AIUserContext, AIGoalContext } from '@/engine/ai/types'

// The role + method shared by every planning prompt. Feature builders add their
// own output-contract rules (JSON shape, item count) after this.
export const LIFEMAP_SYSTEM_PROMPT = [
  'You are the planning intelligence inside LifeMap, an app that helps people reach long-term personal goals.',
  'You break a goal into a clear hierarchy: a goal divides into a few major subgoals (parallel workstreams), each subgoal into ordered milestones (sequenced checkpoints), and milestones into small daily tasks sized to the time the person actually has.',
  'Tailor every suggestion to the specific person and their starting point — two people with the same goal but different backgrounds and time should get different plans.',
  'Respect that foundational work generally comes first, but do not assume a strict order beyond what is stated.',
  'Pace the plan against the deadline: if a deadline is hard and cannot move, front-load and intensify earlier work so the goal is reached before it — never assume the date can slip.',
  'Prefer fewer, concrete, realistic items over long generic lists.',
].join(' ')

// Render the standing user context as labelled lines for a prompt's user message.
// Returns [] when there is no context, so a builder can splice unconditionally.
export function renderUserContextLines(context?: AIUserContext): string[] {
  if (!context) return []
  const lines: string[] = []

  const who: string[] = []
  if (context.situation && context.situation.trim()) who.push(context.situation.trim())
  if (context.situationDetail && context.situationDetail.trim()) {
    who.push(context.situationDetail.trim())
  }
  if (who.length > 0) lines.push(`About the person: ${who.join(' — ')}`)

  if (typeof context.availableHoursPerDay === 'number') {
    lines.push(`Time available: about ${context.availableHoursPerDay} focused hours per day`)
  }
  if (context.lightDays && context.lightDays.length > 0) {
    lines.push(`Lighter days / days off: ${context.lightDays.join(', ')}`)
  }
  if (context.bestTimeOfDay && context.bestTimeOfDay.trim()) {
    lines.push(`Focuses best: ${context.bestTimeOfDay.trim()}`)
  }
  if (context.workRhythm && context.workRhythm.trim()) {
    lines.push(`Preferred work style: ${context.workRhythm.trim()}`)
  }
  if (context.about && context.about.trim()) {
    lines.push(`Notes about the person: ${context.about.trim()}`)
  }
  return lines
}

// Render the per-goal intake as labelled lines. The deadline-hardness line is the
// behavioral steer that makes a hard deadline change the plan's pacing.
export function renderGoalContextLines(context?: AIGoalContext): string[] {
  if (!context) return []
  const lines: string[] = []

  if (context.startingLevel && context.startingLevel.trim()) {
    lines.push(`Starting point on this goal: ${context.startingLevel.trim()}`)
  }
  if (context.priorExperience && context.priorExperience.trim()) {
    lines.push(`Already done toward it: ${context.priorExperience.trim()}`)
  }
  if (context.motivation && context.motivation.trim()) {
    lines.push(`Why it matters to them: ${context.motivation.trim()}`)
  }
  if (context.deadlineHardness === 'hard') {
    lines.push(
      'The deadline is HARD and cannot move: plan to finish before it, front-loading earlier work; never assume the date can slip.',
    )
  } else if (context.deadlineHardness === 'soft') {
    lines.push('The deadline is a flexible target.')
  }
  return lines
}
