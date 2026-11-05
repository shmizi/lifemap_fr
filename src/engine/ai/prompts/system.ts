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
  'You are the planning intelligence inside LifeMap, an app that turns a long-term personal goal into a plan a person can act on today.',
  'You break a goal into a clear hierarchy: a goal divides into a few major subgoals (parallel workstreams the goal genuinely depends on), each subgoal into ordered milestones (sequenced checkpoints), and milestones into small daily tasks sized to the time the person actually has.',
  'Every subgoal you propose MUST be something the person can make concrete daily progress on — never a vague theme, a restatement of the goal, or a workstream that cannot be broken down into real, doable tasks.',
  'Make every task specific and self-contained: one clear action the person can finish in a single focused sitting, phrased so they know exactly what to do and when it is done — e.g. "Complete the Anki deck for German A1 verbs", never "study vocabulary".',
  'Tailor every suggestion to the specific person and their starting point — two people with the same goal but different backgrounds, prior experience, and available time should get different plans; never hand a beginner plan to someone already partway.',
  'Sequence work so foundations come before what builds on them, but do not invent a strict order beyond what the goal and context imply.',
  'Pace the plan honestly against the deadline and the hours available: if a deadline is hard and cannot move, front-load and intensify earlier work so the goal is reached before it — never assume the date can slip; if the goal cannot realistically fit the time, prioritise what matters most rather than padding the list.',
  'Prefer fewer, concrete, high-signal items over long generic ones — a short plan the person actually follows beats an exhaustive one they abandon.',
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

  if (context.successDefinition && context.successDefinition.trim()) {
    lines.push(`What achieving it actually means (the target to plan toward): ${context.successDefinition.trim()}`)
  }
  if (context.startingLevel && context.startingLevel.trim()) {
    lines.push(`Starting point on this goal: ${context.startingLevel.trim()}`)
  }
  if (context.priorExperience && context.priorExperience.trim()) {
    lines.push(`Already done toward it: ${context.priorExperience.trim()}`)
  }
  if (context.motivation && context.motivation.trim()) {
    lines.push(`Why it matters to them: ${context.motivation.trim()}`)
  }
  if (context.learnings && context.learnings.trim()) {
    lines.push(`What they've learned working this goal so far (adapt the plan to this): ${context.learnings.trim()}`)
  }
  // A reference document the user attached, already distilled to its planning
  // constraints. Labelled as authoritative because it usually IS — a syllabus or
  // job spec states requirements the plan has to satisfy, not preferences.
  if (context.documentSummary && context.documentSummary.trim()) {
    const source = context.documentName?.trim()
    lines.push(
      `Requirements from a reference document they attached${source ? ` (${source})` : ''} — treat these as authoritative and plan to satisfy them: ${context.documentSummary.trim()}`,
    )
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
