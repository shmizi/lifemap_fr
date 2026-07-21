// computeRisk — the combined "how likely am I to miss this goal?" read (Stage 2).
//
// PURE TypeScript: no React, no DB, no store, no clock (it takes already-computed
// facts, not `now`).
//
// The other health signals each answer ONE question and stay unblended: Pace ("on
// schedule right now?"), Reliability ("have my plans been trustworthy?"), Projection
// ("finishing how late?"). Risk is the DELIBERATELY blended top-line — a single
// Low/Med/High that folds those together into "probability of missing the goal," so
// the card can lead with one word. It never replaces the others; it summarises them,
// and because it is derived, it is always explainable by pointing back at its inputs.

import type { GoalHealthStatus } from '@/engine/health/computeGoalHealth'
import type { ReliabilityStatus } from '@/engine/health/computeReliability'
import type { DeadlineHardness } from '@/core/types'

export type RiskLevel = 'low' | 'medium' | 'high'

export interface Risk {
  level: RiskLevel
  // The raw weighted total, exposed for tests and later explanation.
  points: number
}

export interface RiskInputs {
  paceStatus: GoalHealthStatus
  reliabilityStatus: ReliabilityStatus
  // projection.daysBehind — 0 when on/ahead of schedule or not projectable.
  daysBehind: number
  deadlineHardness: DeadlineHardness | null
}

// A projected finish this many days past target reads as a serious overrun.
const SERIOUSLY_LATE_DAYS = 21
const MEDIUM_AT = 2
const HIGH_AT = 4

export function computeRisk(inputs: RiskInputs): Risk {
  // Nothing to assess yet — an empty goal can't be "at risk" of missing.
  if (inputs.paceStatus === 'no_tasks') return { level: 'low', points: 0 }

  let points = 0

  // Are you behind right now?
  if (inputs.paceStatus === 'behind') points += 2
  else if (inputs.paceStatus === 'at_risk') points += 1

  // Are you projected to finish late — and can the date even move?
  if (inputs.daysBehind > 0) {
    points += inputs.daysBehind >= SERIOUSLY_LATE_DAYS ? 2 : 1
    if (inputs.deadlineHardness === 'hard') points += 1 // no slack in the date
  }

  // Will you actually keep to the plan? (Chronic slipping raises real risk even
  // when pace currently looks fine.)
  if (inputs.reliabilityStatus === 'unreliable') points += 2
  else if (inputs.reliabilityStatus === 'wavering') points += 1

  const level: RiskLevel =
    points >= HIGH_AT ? 'high' : points >= MEDIUM_AT ? 'medium' : 'low'

  return { level, points }
}
