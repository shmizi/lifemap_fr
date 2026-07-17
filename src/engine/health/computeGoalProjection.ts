// computeGoalProjection — at the current pace, when will this goal finish, and
// how far past its target is that? (Phase 9)
//
// PURE TypeScript: no React, no DB, no store. Time is injected as `now`.
//
// This is a SEPARATE signal from computeGoalHealth. Health scores pace on a 0..100
// scale and buckets it (on_track / at_risk / behind); this instead extrapolates a
// concrete FINISH DATE from the average completion rate so far, and measures the
// gap to the target in whole days ("delayed, and by how much"). Kept as its own
// function per the rule that a computation with diverging semantics gets its own
// home rather than overloading an existing one.

import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { ISODate } from '@/core/types'
import type { Completion } from '@/engine/progress/computeCompletion'

const DATE_KEY = 'yyyy-MM-dd'
// Guard against absurd extrapolation (barely-started goals): a projected time
// beyond the max representable Date is treated as "not projectable".
const MAX_DATE_MS = 8.64e15

export interface GoalProjection {
  // Estimated completion date at the current average pace (date-only YYYY-MM-DD),
  // or null when it can't be meaningfully projected: no tasks, no time elapsed,
  // or no progress yet (a zero rate would never finish).
  projectedDate: ISODate | null
  // Whole days the projected finish falls AFTER the target date — 0 when on or
  // ahead of schedule, or when not projectable. "How late, at this pace."
  daysBehind: number
}

export function computeGoalProjection(
  createdAt: ISODate,
  targetDate: ISODate,
  completion: Completion,
  now: Date,
): GoalProjection {
  const notProjectable: GoalProjection = { projectedDate: null, daysBehind: 0 }

  if (completion.total === 0) return notProjectable // nothing to assess
  if (completion.percent >= 100) {
    // Done — finished as of now, never "behind".
    return { projectedDate: format(now, DATE_KEY), daysBehind: 0 }
  }
  if (completion.percent <= 0) return notProjectable // no progress -> no rate

  const created = parseISO(createdAt).getTime()
  const nowMs = now.getTime()
  const elapsedMs = nowMs - created
  if (elapsedMs <= 0) return notProjectable // created now / in the future

  // Average rate so far (percent per ms); extrapolate the remaining percent.
  const ratePerMs = completion.percent / elapsedMs
  const msNeeded = (100 - completion.percent) / ratePerMs
  const projectedMs = nowMs + msNeeded
  if (!Number.isFinite(projectedMs) || projectedMs > MAX_DATE_MS) {
    return notProjectable
  }

  const projected = new Date(projectedMs)
  const daysBehind = Math.max(
    0,
    differenceInCalendarDays(projected, parseISO(targetDate)),
  )
  return { projectedDate: format(projected, DATE_KEY), daysBehind }
}
