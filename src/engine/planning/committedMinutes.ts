// committedMinutes — how much of each day is ALREADY spoken for, across every goal.
//
// PURE TypeScript: no React, no DB, no store, no clock.
//
// WHY THIS EXISTS: the daily capacity budget (profile.availableHoursPerDay) was
// being applied PER GENERATION rather than per DAY. Each goal's roadmap was packed
// against an empty calendar, so a user with four goals got four independent plans
// that each filled the whole day — a 4x overcommitment that surfaced days later as
// a flood of "missed" tasks the person never had a chance of doing.
//
// The fix is to make every scheduler place work against what the calendar ALREADY
// holds. This module computes that load once, from the task rows, so the packer
// (packSessionsIntoDays), the daily scheduler (scheduleDailyTasks) and the
// reschedulers (rescheduleOverdue) all reason about the same number.
//
// COMPLETED WORK IS EXCLUDED: a finished task consumed capacity on the day it was
// done, not on the days still ahead. Counting it would make a productive week look
// full and push new work needlessly far out.
//
// UNDATED BACKLOG IS EXCLUDED: it isn't on the calendar (see partitionTasks), so it
// claims no day's minutes.

import type { ISODate, Task } from '@/core/types'

// The fields the calculation reads — so callers can pass Tasks or any lighter
// projection, matching the isOverdue convention.
export type CommittedCandidate = Pick<
  Task,
  'id' | 'scheduledDate' | 'status' | 'estimatedMinutes'
>

// Minutes claimed per date-only 'YYYY-MM-DD' key.
export type CommittedByDay = Record<ISODate, number>

export interface CommittedOptions {
  // Minutes to assume for a scheduled task that carries no estimate. Without this
  // an un-estimated task would read as free, and a day full of them would look
  // empty to the packer.
  defaultMinutes: number
  // Task ids to leave OUT of the tally — the set being re-placed right now. A
  // reschedule or rebalance must not count the very tasks it is about to move as
  // occupying the days it is moving them onto, or it would refuse its own work.
  excludeIds?: ReadonlySet<string>
}

export function computeCommittedMinutesByDay(
  tasks: ReadonlyArray<CommittedCandidate>,
  opts: CommittedOptions,
): CommittedByDay {
  const exclude = opts.excludeIds
  const out: CommittedByDay = {}
  for (const task of tasks) {
    if (task.scheduledDate === undefined) continue
    if (task.status === 'completed') continue
    if (exclude?.has(task.id)) continue
    const minutes = task.estimatedMinutes ?? opts.defaultMinutes
    out[task.scheduledDate] = (out[task.scheduledDate] ?? 0) + minutes
  }
  return out
}

// Merge two per-day minute maps (e.g. the calendar's existing load plus the
// habit occurrences this generation is about to reserve). Neither input is
// mutated. Used where a caller has to reserve against both at once.
export function mergeCommittedMinutes(
  a: CommittedByDay,
  b: CommittedByDay,
): CommittedByDay {
  const out: CommittedByDay = { ...a }
  for (const [day, minutes] of Object.entries(b)) {
    out[day] = (out[day] ?? 0) + minutes
  }
  return out
}

// One day's load, for the callers that ask about a single date.
export function committedOn(map: CommittedByDay, day: ISODate): number {
  return map[day] ?? 0
}

// The days whose committed load EXCEEDS the daily budget, soonest first. This is
// the recalc signal: it is what an already-overcommitted calendar looks like, and
// what a rebalance has to relieve. A day exactly at budget is full, not over.
export function findOvercommittedDays(
  map: CommittedByDay,
  dailyBudgetMinutes: number,
): Array<{ day: ISODate; minutes: number }> {
  const budget = Math.max(1, dailyBudgetMinutes)
  return Object.entries(map)
    .filter(([, minutes]) => minutes > budget)
    .map(([day, minutes]) => ({ day, minutes }))
    .sort((a, b) => a.day.localeCompare(b.day))
}
