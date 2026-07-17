// engine/ai/scheduleDailyTasks.ts — assign calendar dates to an ordered run of
// daily sessions (Phase 5).
//
// PURE: no fetch, no DB, no store, and time is INJECTED (startDate parameter) —
// never read from the clock here. This is the "WHEN" half of the daily-plan
// feature: the model supplies an ordered list of sessions (what to do), this
// lays them onto consecutive calendar days starting from startDate. Keeping the
// date math in one pure, tested place is exactly why the model is NOT asked to
// emit dates.

import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { ISODate } from '@/core/types'
import type { PlannedSession, ScheduledDailyTask } from '@/engine/ai/types'

// Date-only local key, matching the dashboard's scheduledDate convention.
const DATE_KEY = 'yyyy-MM-dd'

// Where a (re)generated daily plan should begin, and how many days it covers.
export interface PlanWindow {
  startDate: Date
  days: number
}

// Decide the window for a daily plan so RE-running EXTENDS it instead of piling
// new tasks onto days that already have one. PURE, time injected (today):
//  - startDate = the day after the subgoal's last already-scheduled task, but
//    never earlier than today (a stale plan whose tail is in the past resumes
//    from today, not from where it left off long ago).
//  - days = the horizon, capped by the days remaining from startDate to any
//    deadline. 0 when the plan already reaches the deadline (nothing to add) —
//    the caller treats that as "no plan this time".
export function computePlanWindow(
  today: Date,
  lastScheduledDate: ISODate | null,
  targetDate: ISODate | null,
  horizon: number,
): PlanWindow {
  let startDate = today
  if (lastScheduledDate) {
    const dayAfterLast = addDays(parseISO(lastScheduledDate), 1)
    // Only jump forward — a past tail resumes from today.
    if (differenceInCalendarDays(dayAfterLast, today) > 0) startDate = dayAfterLast
  }

  let days = horizon
  if (targetDate) {
    const remaining = differenceInCalendarDays(parseISO(targetDate), startDate)
    days = Math.max(0, Math.min(horizon, remaining))
  }
  return { startDate, days }
}

// Lay each session onto a day, skipping the user's days off. Without skip days
// this is one session per consecutive day; with them, sessions only land on
// working days (a session is never scheduled on a day the user marked off — that
// is the capacity rule: don't pile work onto rest days). Each task's estimate is
// the model's OWN per-session `minutes` when present, falling back to
// `defaultMinutes` for a session that carried none (Phase 10: durations are
// model-decided, not one fixed value). Order is preserved; an empty list yields an
// empty plan.
//
// `skipWeekdays` are day-of-week indices (0 = Sunday .. 6 = Saturday), matching
// UserContext.lightDays and Date.getDay(). If every weekday is marked off (a
// degenerate input) the skip is ignored, so this can never loop forever.
export function scheduleDailyTasks(
  sessions: PlannedSession[],
  startDate: Date,
  defaultMinutes: number,
  skipWeekdays: number[] = [],
): ScheduledDailyTask[] {
  const skip = skipWeekdays.length >= 7 ? new Set<number>() : new Set(skipWeekdays)
  const out: ScheduledDailyTask[] = []
  let cursor = startDate
  for (const session of sessions) {
    // Advance to the next day that is not a day off.
    while (skip.has(cursor.getDay())) cursor = addDays(cursor, 1)
    const scheduledDate = format(cursor, DATE_KEY)
    const estimatedMinutes = session.minutes ?? defaultMinutes
    out.push(
      session.description
        ? {
            title: session.title,
            description: session.description,
            scheduledDate,
            estimatedMinutes,
            isRecurring: false,
          }
        : { title: session.title, scheduledDate, estimatedMinutes, isRecurring: false },
    )
    cursor = addDays(cursor, 1)
  }
  return out
}

// Where a recurring overlay spans and how long each occurrence takes.
export interface ExpandRecurringOptions {
  // The plan window's first day (same start as the progression backbone).
  startDate: Date
  // How many calendar days the window covers — occurrences never land beyond it.
  windowDays: number
  // Per-occurrence minutes when a session carries none of its own.
  defaultMinutes: number
  // Days off (0 = Sunday .. 6 = Saturday). Occurrences that fall on a rest day are
  // SKIPPED (not shifted) — a habit doesn't run on a day the user marked off, and
  // skipping avoids two occurrences piling onto the same next-working-day.
  skipWeekdays?: number[]
}

// Expand each RECURRING session into its dated occurrences across the plan window,
// laid at its interval (everyDays) from the window's first working day. This is the
// habit/maintenance OVERLAY that sits alongside the one-time progression backbone
// (scheduleDailyTasks): together they form a daily plan that both advances AND keeps
// up regular practice. PURE, time injected. Non-recurring sessions are ignored (the
// caller passes only the recurring ones); every occurrence is flagged isRecurring.
//
// Anchoring from the first WORKING day means a weekly (everyDays 7) habit keeps a
// stable weekday and so never collides with a rest day; shorter intervals that drift
// onto a rest day simply skip that occurrence.
export function expandRecurringSessions(
  sessions: PlannedSession[],
  opts: ExpandRecurringOptions,
): ScheduledDailyTask[] {
  const skip =
    opts.skipWeekdays && opts.skipWeekdays.length < 7
      ? new Set(opts.skipWeekdays)
      : new Set<number>()
  const windowDays = Math.max(0, opts.windowDays)

  // First working day on/after the window start — the recurrence anchor.
  let base = opts.startDate
  while (skip.has(base.getDay())) base = addDays(base, 1)

  const out: ScheduledDailyTask[] = []
  for (const session of sessions) {
    if (!session.recurrence) continue
    const every = Math.max(1, session.recurrence.everyDays)
    const estimatedMinutes = session.minutes ?? opts.defaultMinutes
    for (let offset = 0; ; offset += every) {
      const day = addDays(base, offset)
      // Never place an occurrence beyond the plan window (measured from startDate).
      if (differenceInCalendarDays(day, opts.startDate) >= windowDays) break
      if (skip.has(day.getDay())) continue // habit skips rest days
      const scheduledDate = format(day, DATE_KEY)
      out.push(
        session.description
          ? {
              title: session.title,
              description: session.description,
              scheduledDate,
              estimatedMinutes,
              isRecurring: true,
            }
          : { title: session.title, scheduledDate, estimatedMinutes, isRecurring: true },
      )
    }
  }
  return out
}
