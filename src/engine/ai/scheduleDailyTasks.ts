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
import type { AISuggestion, ScheduledDailyTask } from '@/engine/ai/types'

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

// Lay each session onto a day: item i -> startDate + i days. Every task gets the
// same per-day estimate (estimatedMinutes), since a consistency subgoal practices
// a fixed amount daily. Order is preserved; an empty list yields an empty plan.
export function scheduleDailyTasks(
  sessions: AISuggestion[],
  startDate: Date,
  estimatedMinutes: number,
): ScheduledDailyTask[] {
  return sessions.map((session, index) => {
    const scheduledDate = format(addDays(startDate, index), DATE_KEY)
    return session.description
      ? {
          title: session.title,
          description: session.description,
          scheduledDate,
          estimatedMinutes,
        }
      : { title: session.title, scheduledDate, estimatedMinutes }
  })
}
