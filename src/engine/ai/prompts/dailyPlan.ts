// engine/ai/prompts/dailyPlan.ts — build the model request that asks for a
// short daily study plan for a consistency subgoal (Phase 5).
//
// PURE: no fetch, no DB, no store. The model decides WHAT each day's session is
// (an ordered list of {title, description}); a separate PURE engine function
// (engine/ai/scheduleDailyTasks.ts) decides WHEN (assigns calendar dates). That
// split keeps all date math in the engine, testable and time-injected, and lets
// the model focus on curriculum. Output is the same {title, description} JSON
// array the shared parseSuggestionList primitive already handles.

import type { AIRequest, DailyPlanContext } from '@/engine/ai/types'

// The bounded planning window (DAILY_PLAN_HORIZON) lives in core/constants so the
// UI can read it without importing engine/; the caller passes the already-bounded
// day count in via context.days, so this builder needs only that.

export function buildDailyPlanPrompt(context: DailyPlanContext): AIRequest {
  const { subgoalTitle, subgoalDescription, goalTitle, dailyMinutes, days } =
    context

  const SYSTEM_INSTRUCTION = [
    'You design a short daily practice plan for a personal subgoal.',
    `Produce an ordered list of up to ${days} daily sessions, one per day, that build on each other.`,
    `Each session should be about ${dailyMinutes} minutes of focused work.`,
    'Each needs a short title and one concise sentence on what to do that day.',
    'Respond with ONLY a JSON array of objects shaped {"title": string, "description": string}.',
    'No prose, no markdown, no code fences around the array.',
  ].join(' ')

  const lines: string[] = [
    `Goal: ${goalTitle}`,
    `Subgoal: ${subgoalTitle}`,
    `Minutes per day: ${dailyMinutes}`,
    `Days to plan: ${days}`,
  ]
  if (subgoalDescription.trim().length > 0) {
    lines.push(`Subgoal description: ${subgoalDescription.trim()}`)
  }
  lines.push('Design the daily plan.')

  return {
    system: SYSTEM_INSTRUCTION,
    messages: [{ role: 'user', content: lines.join('\n') }],
  }
}
