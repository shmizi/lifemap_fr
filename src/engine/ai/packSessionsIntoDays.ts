// packSessionsIntoDays — the capacity day-packer (Phase 9, step 4).
//
// PURE: no fetch, no DB, no store; time injected via startDate. Given an ordered
// run of sessions from ACROSS subgoals (each carrying its own minute cost), it
// fills each working day up to a minute budget, spilling the overflow to the next
// working day — so the whole day's work across every subgoal never exceeds what
// the user said they can do, and nothing lands on a day off.
//
// This is the cross-subgoal counterpart to scheduleDailyTasks (which dates ONE
// subgoal's sessions): here many subgoals share one daily budget. Interleaving is
// the CALLER's job — pass the sessions already round-robined across subgoals and
// the packer preserves that order, so a packed day mixes subjects instead of
// burning the whole budget on one.

import { addDays, differenceInCalendarDays, format } from 'date-fns'
import type { ID, ISODate } from '@/core/types'

const DATE_KEY = 'yyyy-MM-dd'

export interface PackSession {
  subgoalId: ID
  title: string
  description?: string
  minutes: number
}

export interface PackedSession extends PackSession {
  scheduledDate: ISODate
}

export interface PackOptions {
  startDate: Date
  // Minutes of work a single day may hold across ALL subgoals.
  dailyBudgetMinutes: number
  // Day-of-week indices (0=Sun..6=Sat) to skip (the user's days off).
  skipWeekdays?: number[]
  // Cap on the calendar-day span from startDate; sessions that would land beyond
  // it are dropped (they belong to a later rolling-window generation).
  maxDays?: number
}

export function packSessionsIntoDays(
  sessions: PackSession[],
  opts: PackOptions,
): PackedSession[] {
  // Ignore a degenerate all-week skip so the day cursor can never loop forever.
  const skip =
    opts.skipWeekdays && opts.skipWeekdays.length < 7
      ? new Set(opts.skipWeekdays)
      : new Set<number>()
  const budget = Math.max(1, opts.dailyBudgetMinutes)
  const maxDays = opts.maxDays ?? Number.POSITIVE_INFINITY

  const out: PackedSession[] = []
  let cursor = opts.startDate
  const advanceToWorkday = (): void => {
    while (skip.has(cursor.getDay())) cursor = addDays(cursor, 1)
  }
  advanceToWorkday()
  let usedToday = 0

  for (const session of sessions) {
    if (differenceInCalendarDays(cursor, opts.startDate) >= maxDays) break

    // Full day? Move to the next working day. (A single session bigger than the
    // whole budget still lands — alone — on its own day, never dropped for size.)
    if (usedToday > 0 && usedToday + session.minutes > budget) {
      cursor = addDays(cursor, 1)
      advanceToWorkday()
      usedToday = 0
      if (differenceInCalendarDays(cursor, opts.startDate) >= maxDays) break
    }

    out.push({ ...session, scheduledDate: format(cursor, DATE_KEY) })
    usedToday += session.minutes
  }
  return out
}
