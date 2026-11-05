// engine/ai/rescheduleOverdue.ts — pull missed (overdue) work back onto the
// calendar (Phase 10 scheduler, reschedule-on-miss).
//
// PURE: no fetch, no DB, no store; time is INJECTED via `from`. Given the overdue
// tasks (each carrying its own minute cost) it spreads them forward onto upcoming
// working days at the user's daily capacity, so missed work returns to real days
// instead of accumulating in the past. This is the Adaptability pillar in engine
// form: the plan responds when you fall behind.
//
// Deadline behaviour (the caller passes maxDate only for a HARD deadline):
//  - soft / no maxDate: spread forward at capacity, unbounded.
//  - hard: never place work past the deadline. Overflow that cannot fit before it
//    is COMPRESSED onto the last allowed working day — a visible overload, which is
//    the honest signal that the remaining work does not fit (the date must not slip).
//
// Sibling of scheduleDailyTasks (one subgoal, forward) and packSessionsIntoDays
// (many subgoals, one budget). This one re-places EXISTING dated tasks by id.

import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { ID, ISODate } from '@/core/types'

const DATE_KEY = 'yyyy-MM-dd'

export interface RescheduleItem {
  id: ID
  // The task's estimated minutes (the caller applies a default for tasks with none).
  minutes: number
  // Earliest day this item may land. A rebalance sets it to the task's current date
  // so relieving an overloaded day only ever pushes work later: it never pulls a task
  // planned for next month into a gap this week.
  notBefore?: ISODate
}

export interface RescheduledItem {
  id: ID
  scheduledDate: ISODate
}

export interface RescheduleOptions {
  // Today — placement starts here (never in the past). Injected for purity.
  from: Date
  // Minutes a single day may hold across the rescheduled work.
  dailyBudgetMinutes: number
  // Days off (0 = Sunday .. 6 = Saturday). A degenerate all-seven skip is ignored
  // so the day cursor can never loop forever.
  skipWeekdays?: number[]
  // Latest date work may occupy — a HARD deadline's target. null/undefined leaves
  // it unbounded (a soft deadline). Overflow past it is compressed, never moved past.
  maxDate?: ISODate | null
  // Minutes ALREADY committed on each upcoming day by work this reschedule is not
  // touching — chiefly other goals' tasks (see engine/planning/committedMinutes).
  // A day begins already this full, so recovered work lands in the gaps the
  // calendar actually has instead of being stacked onto days that are already
  // spoken for. Absent/empty ⇒ unchanged behaviour (an empty calendar).
  //
  // The caller MUST exclude the items being moved from this map, or their current
  // dates would count against the very days they are being moved onto.
  committedMinutesByDay?: Record<ISODate, number>
}

// Re-place overdue items onto upcoming working days at capacity. Order is preserved
// (the caller passes them in the order they should be worked — e.g. most overdue
// first). An empty list yields an empty result.
export function rescheduleOverdue(
  items: RescheduleItem[],
  opts: RescheduleOptions,
): RescheduledItem[] {
  const skip =
    opts.skipWeekdays && opts.skipWeekdays.length < 7
      ? new Set(opts.skipWeekdays)
      : new Set<number>()
  const budget = Math.max(1, opts.dailyBudgetMinutes)
  // Bound on the forward scan for a free day (see the placement loop below).
  const MAX_SCAN_DAYS = 365

  const nextWorkday = (d: Date): Date => {
    let c = d
    while (skip.has(c.getDay())) c = addDays(c, 1)
    return c
  }
  const prevWorkday = (d: Date): Date => {
    let c = d
    while (skip.has(c.getDay())) c = addDays(c, -1)
    return c
  }

  // First working day on/after today — the earliest anything may land.
  const floor = nextWorkday(opts.from)

  // Last working day work may occupy (hard deadline). A deadline already at/behind
  // today collapses to `floor` — a passed hard deadline means "it is all due now".
  let last: Date | null = null
  if (opts.maxDate) {
    const candidate = prevWorkday(parseISO(opts.maxDate))
    last = differenceInCalendarDays(candidate, floor) < 0 ? floor : candidate
  }

  // A day starts already occupied by whatever else the calendar holds that day.
  const committed = opts.committedMinutesByDay ?? {}
  const committedOn = (d: Date): number => committed[format(d, DATE_KEY)] ?? 0

  let cursor = floor
  let usedToday = committedOn(cursor)
  const out: RescheduledItem[] = []
  for (const item of items) {
    if (item.notBefore) {
      let earliest = nextWorkday(parseISO(item.notBefore))
      if (last && differenceInCalendarDays(earliest, last) > 0) earliest = last
      if (differenceInCalendarDays(earliest, cursor) > 0) {
        cursor = earliest
        usedToday = committedOn(cursor)
      }
    }
    // Day full? Walk forward to the first working day that can hold this item —
    // unless that would cross a hard deadline, in which case stay put and compress
    // the rest onto this (last allowed) day. Scanning in a LOOP rather than a
    // single step matters once committedMinutesByDay is supplied: several
    // consecutive days can already be full, and a one-step advance would drop the
    // item onto the next full day anyway.
    //
    // `usedToday > 0` keeps the existing guarantee that an item larger than the
    // whole budget still lands on an otherwise-empty day rather than looping
    // forever. MAX_SCAN_DAYS bounds the walk on a calendar that is full for a very
    // long stretch — past it the item lands regardless, since overflowing a day
    // beats dropping the work.
    let scanned = 0
    while (
      usedToday > 0 &&
      usedToday + item.minutes > budget &&
      scanned < MAX_SCAN_DAYS
    ) {
      const advanced = nextWorkday(addDays(cursor, 1))
      if (last && differenceInCalendarDays(advanced, last) > 0) break
      cursor = advanced
      usedToday = committedOn(cursor)
      scanned += 1
    }
    out.push({ id: item.id, scheduledDate: format(cursor, DATE_KEY) })
    usedToday += item.minutes
  }
  return out
}
