// computeReliability — how trustworthy have this goal's plans been over time?
//
// PURE TypeScript: no React, no DB, no store. Time is injected as `now`.
//
// The COMPANION to computeGoalHealth, deliberately SEPARATE (never blended). Pace
// answers exactly one question — "am I on schedule right now?" — and fully recovers
// the moment completion catches up. That left a hole: rescheduling missed work, then
// finishing it late, restored pace with NO lasting trace of the slip (a free second
// chance). Reliability closes it. It is a REPUTATION, not a punishment: every slip
// (a reschedule, a late finish, an open miss) dents it, but the dent FADES with time,
// so a stretch of consistency climbs it back — just like trust in real life.
//
// How it recovers: each commitment's outcome is weighted by RECENCY (a 30-day
// half-life), so recent behaviour dominates and old slips decay toward irrelevance.
// A month of on-time work will outweigh last quarter's misses.
//
// It reads only durable facts already on the task: `rescheduleCount` (set by the
// reschedule actions, never cleared), and `completedAt` vs `scheduledDate` (a task
// finished after its date was late). So a reschedule can't hide a slip — the count
// remembers even after scheduledDate is rewritten.

import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { Task } from '@/core/types'

export type ReliabilityStatus =
  | 'reliable'
  | 'wavering'
  | 'unreliable'
  | 'no_history' // no completed or overdue commitments yet — nothing to judge

export interface Reliability {
  score: number // 0..100 (recency-weighted; higher = more trustworthy)
  status: ReliabilityStatus
  // Raw tallies, exposed for the card's explanation and later insights (Stage 2).
  reschedules: number // total reschedules across the goal's tasks
  lateCompletions: number // completed after their scheduled date
  onTimeCompletions: number // completed on time and never rescheduled
  openMisses: number // still incomplete and past their scheduled date (right now)
}

// Each reschedule costs this much quality, capped so a much-postponed task floors out
// rather than going negative.
const RESCHEDULE_PENALTY = 0.25
const RESCHEDULE_CAP = 3
// A late (but finished) completion costs this on top of any reschedule penalty.
const LATE_PENALTY = 0.2
// An open miss (past due, not done) is the worst live signal — low residual quality.
const OPEN_MISS_QUALITY = 0.15
// Recency half-life in days: an outcome this old counts half as much as a fresh one.
const HALF_LIFE_DAYS = 30
// Score bucket thresholds.
const RELIABLE_AT = 80
const WAVERING_AT = 55

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

// One commitment outcome: its quality in [0,1] and the date it happened (for recency).
interface Outcome {
  quality: number
  date: Date
}

export function computeReliability(tasks: Task[], now: Date): Reliability {
  const today = now
  let reschedules = 0
  let lateCompletions = 0
  let onTimeCompletions = 0
  let openMisses = 0
  const outcomes: Outcome[] = []

  for (const t of tasks) {
    const rc = t.rescheduleCount ?? 0
    reschedules += rc

    if (t.status === 'completed') {
      // Late = finished on a calendar day after its scheduled date.
      const late =
        t.scheduledDate !== undefined &&
        t.completedAt !== undefined &&
        differenceInCalendarDays(
          parseISO(t.completedAt),
          parseISO(t.scheduledDate),
        ) > 0
      if (late) lateCompletions++
      else if (rc === 0) onTimeCompletions++

      const quality = clamp01(
        1 -
          RESCHEDULE_PENALTY * Math.min(rc, RESCHEDULE_CAP) -
          (late ? LATE_PENALTY : 0),
      )
      // Anchor recency to when it was finished.
      const date = t.completedAt ? parseISO(t.completedAt) : today
      outcomes.push({ quality, date })
    } else if (
      t.scheduledDate !== undefined &&
      differenceInCalendarDays(today, parseISO(t.scheduledDate)) > 0
    ) {
      // Open miss: past due and still not done.
      openMisses++
      const quality = clamp01(
        OPEN_MISS_QUALITY - RESCHEDULE_PENALTY * Math.min(rc, RESCHEDULE_CAP),
      )
      // Anchor recency to when it was due.
      outcomes.push({ quality, date: parseISO(t.scheduledDate) })
    } else if (rc > 0) {
      // Provisional slip: it has been rescheduled at least once and re-planned to a
      // future day (not yet due, not done). This is what stops rescheduling from
      // buying a clean slate — moving an open miss forward keeps it dented here,
      // rather than dropping it out of scoring until it finally completes. Re-planning
      // is still better than an open miss, so quality is higher, but never 1.
      const quality = clamp01(1 - RESCHEDULE_PENALTY * Math.min(rc, RESCHEDULE_CAP))
      // Anchor recency to when it was last touched (the reschedule).
      outcomes.push({ quality, date: parseISO(t.updatedAt) })
    }
    // A not-yet-due incomplete task that has NEVER slipped has no outcome — neutral.
  }

  if (outcomes.length === 0) {
    return {
      score: 100,
      status: 'no_history',
      reschedules,
      lateCompletions,
      onTimeCompletions,
      openMisses,
    }
  }

  // Recency-weighted average quality → 0..100.
  let weightedSum = 0
  let weightTotal = 0
  for (const o of outcomes) {
    const ageDays = Math.max(0, differenceInCalendarDays(today, o.date))
    const weight = Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
    weightedSum += weight * o.quality
    weightTotal += weight
  }
  const score = Math.round((weightedSum / weightTotal) * 100)

  const status: ReliabilityStatus =
    score >= RELIABLE_AT
      ? 'reliable'
      : score >= WAVERING_AT
        ? 'wavering'
        : 'unreliable'

  return {
    score,
    status,
    reschedules,
    lateCompletions,
    onTimeCompletions,
    openMisses,
  }
}
