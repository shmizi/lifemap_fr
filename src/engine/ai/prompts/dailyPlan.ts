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
import {
  LIFEMAP_SYSTEM_PROMPT,
  renderUserContextLines,
  renderGoalContextLines,
} from '@/engine/ai/prompts/system'
import { renderStrategyBriefLines } from '@/engine/ai/prompts/strategyBrief'
import { renderDigestLines } from '@/engine/review/computeRoadmapDigest'

// The bounded planning window (DAILY_PLAN_HORIZON) lives in core/constants so the
// UI can read it without importing engine/; the caller passes the already-bounded
// day count in via context.days, so this builder needs only that.

export function buildDailyPlanPrompt(context: DailyPlanContext): AIRequest {
  const {
    subgoalTitle,
    subgoalDescription,
    goalTitle,
    dailyMinutes,
    days,
    userContext,
    goalContext,
    strategyBrief,
    digest,
    plannedElsewhere,
  } = context

  const SYSTEM_INSTRUCTION = [
    LIFEMAP_SYSTEM_PROMPT,
    'For this request, design a short daily practice plan for a personal subgoal.',
    `Produce an ordered list of up to ${days} daily sessions, one per day, that build on each other.`,
    `Give each session a realistic "minutes" estimate for how long it takes — most around ${dailyMinutes} minutes, but vary them where the work genuinely needs more or less. Do NOT make every session the same length.`,
    'Almost every session is one-time progress, laid out day by day — that backbone already covers daily work, so you rarely need recurrence. Only for a genuine maintenance rhythm that repeats LESS often than daily (regular review, practice, or check-ins) may you mark a session recurring by adding "recurrence": {"everyDays": N} — prefer every other day (2) or weekly (7), not daily (1). Mark at most one or two sessions recurring; most plans need none. Never mark one-time progression recurring.',
    'Stay strictly within THIS subgoal. If a piece of work is already listed under "Already planned elsewhere", it is owned by another part of the plan — do NOT repeat it; assume it is handled and build only what this subgoal uniquely needs.',
    'Each needs a short title, one concise sentence on what to do that day, and its minutes estimate.',
    'Respond with ONLY a JSON array of objects shaped {"title": string, "description": string, "minutes": number, "recurrence"?: {"everyDays": number}}.',
    'No prose, no markdown, no code fences around the array.',
  ].join(' ')

  const lines: string[] = [
    `Goal: ${goalTitle}`,
    `Subgoal: ${subgoalTitle}`,
    `Minutes per day: ${dailyMinutes}`,
    `Days to plan: ${days}`,
  ]
  if (subgoalDescription.trim().length > 0) {
    lines.push(`What completing this subgoal looks like: ${subgoalDescription.trim()}`)
  }
  // Personalization: who this is for and where they stand on the goal.
  lines.push(...renderUserContextLines(userContext))
  lines.push(...renderGoalContextLines(goalContext))
  // Phase 10: the Direction the sessions should serve (goal's Strategy Brief).
  lines.push(...renderStrategyBriefLines(strategyBrief))
  // Phase 10: the bounded roadmap digest — where this phase sits in the whole plan
  // and how recent execution has gone — so the sessions stay coherent with reality.
  if (digest) lines.push(...renderDigestLines(digest))
  // De-dup: the actual task titles other subgoals already cover, so this plan does
  // not regenerate the same work (the digest only carries counts). Bounded list.
  if (plannedElsewhere && plannedElsewhere.length > 0) {
    lines.push('Already planned elsewhere (do NOT repeat these — another subgoal owns them):')
    for (const title of plannedElsewhere) lines.push(`- ${title}`)
  }
  lines.push('Design the daily plan.')

  return {
    system: SYSTEM_INSTRUCTION,
    messages: [{ role: 'user', content: lines.join('\n') }],
    // High-volume, less nuanced day-by-day scheduling — use the fast tier.
    tier: 'fast',
  }
}
