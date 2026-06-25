// computeGoalHealth — is a goal keeping pace with its deadline? (Phase 3)
//
// PURE TypeScript: no React, no DB, no store. Time is injected as `now`.
//
// ONE CONTRIBUTOR, ONE SENTENCE — pace. This score answers exactly one question:
// "Is your completed work keeping up with the share of time you have already
// spent toward the target date?" It deliberately does NOT fold in urgency,
// streaks, dependencies, or anything else. Each of those would need its own
// clearly-explainable justification before joining this number, and none are
// here yet — Goal Health stays a thing the user can understand, not a catch-all.
// (The dependency signal is intentionally deferred until the roadmap surfaces
// dependencies visually first; there is a clean seam for it here later.)
//
// Definition:
//   elapsedFraction = (now - createdAt) / (targetDate - createdAt), clamped 0..1
//   expectedPercent = elapsedFraction * 100      // where a steady pace would be
//   paceGap         = completionPercent - expectedPercent
//   score           = clamp(100 + min(paceGap, 0), 0, 100)
//                     // on/ahead of pace -> 100; behind -> 100 minus how far
//                     // completion trails the time already used.

import { parseISO } from 'date-fns'
import type { ISODate } from '@/core/types'
import type { Completion } from '@/engine/progress/computeCompletion'

// 'no_tasks' is a distinct, honest state: a goal with nothing to do yet cannot be
// "behind" — the UI can simply show no health for it rather than a misleading score.
export type GoalHealthStatus = 'on_track' | 'at_risk' | 'behind' | 'no_tasks'

export interface GoalHealth {
  score: number // 0..100
  status: GoalHealthStatus
  // Where a steady pace would put completion right now (0..100), exposed so the
  // UI can explain a status in one line ("expected ~60% by now").
  expectedPercent: number
}

// Completion within this many points of the expected pace (or ahead) reads as on
// track — a little slippage is normal and shouldn't cry wolf.
const ON_TRACK_WITHIN = 10
// More than this many points behind the expected pace reads as behind; between
// the two thresholds is at risk.
const BEHIND_BEYOND = 30

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function computeGoalHealth(
  createdAt: ISODate,
  targetDate: ISODate,
  completion: Completion,
  now: Date,
): GoalHealth {
  // Nothing to assess yet — don't invent a score for an empty goal.
  if (completion.total === 0) {
    return { score: 100, status: 'no_tasks', expectedPercent: 0 }
  }

  const created = parseISO(createdAt).getTime()
  const target = parseISO(targetDate).getTime()
  const nowMs = now.getTime()
  const span = target - created

  // Degenerate window (target at or before creation): the only meaningful read
  // is whether we are past the target. Otherwise the normal elapsed fraction.
  const elapsedFraction =
    span <= 0
      ? nowMs >= target
        ? 1
        : 0
      : clamp((nowMs - created) / span, 0, 1)

  const expectedPercent = elapsedFraction * 100
  const paceGap = completion.percent - expectedPercent

  // Behind only ever lowers the score; being ahead of pace doesn't push past 100.
  const score = clamp(Math.round(100 + Math.min(paceGap, 0)), 0, 100)

  let status: GoalHealthStatus
  if (paceGap >= -ON_TRACK_WITHIN) status = 'on_track'
  else if (paceGap > -BEHIND_BEYOND) status = 'at_risk'
  else status = 'behind'

  return { score, status, expectedPercent: Math.round(expectedPercent) }
}
