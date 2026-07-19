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
  // RESERVE-then-pack (Phase 10): minutes already spoken for on given days —
  // keyed by 'yyyy-MM-dd' — before any of these sessions are placed. The caller
  // pre-expands RECURRING habits (which land on fixed cadence dates) and passes
  // their per-day minute totals here; the packer then fits the one-time progression
  // backbone into what each day has LEFT, so a day's habits + progression together
  // never exceed the budget. Absent/empty ⇒ unchanged behaviour (nothing reserved).
  reservedMinutesByDay?: Record<ISODate, number>
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
  const reserved = opts.reservedMinutesByDay ?? {}
  // Minutes already reserved (by pre-placed recurring habits) on a given day.
  const reservedOn = (d: Date): number => reserved[format(d, DATE_KEY)] ?? 0

  const out: PackedSession[] = []
  let cursor = opts.startDate
  const advanceToWorkday = (): void => {
    while (skip.has(cursor.getDay())) cursor = addDays(cursor, 1)
  }
  advanceToWorkday()
  // A day begins already "used" by whatever habits are reserved on it, so the
  // progression backbone only fills the remainder.
  let usedToday = reservedOn(cursor)

  for (const session of sessions) {
    // Advance to the first working day that can hold this session. A session lands
    // when it FITS in the day's remaining budget, OR the day is otherwise EMPTY
    // (usedToday === 0: no reservation and nothing packed) — a single session
    // bigger than the whole budget still lands, alone, rather than being dropped
    // for size. Otherwise skip forward (past habit-reserved or already-full days),
    // so a spilled session never overflows a day whose habits already claim it.
    while (differenceInCalendarDays(cursor, opts.startDate) < maxDays) {
      if (usedToday + session.minutes <= budget || usedToday === 0) break
      cursor = addDays(cursor, 1)
      advanceToWorkday()
      usedToday = reservedOn(cursor)
    }
    // Ran out of window — the rest belongs to a later rolling generation.
    if (differenceInCalendarDays(cursor, opts.startDate) >= maxDays) break

    out.push({ ...session, scheduledDate: format(cursor, DATE_KEY) })
    usedToday += session.minutes
  }
  return out
}
