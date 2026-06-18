// computeWeeklyReview — the pure data behind the Weekly Review page (Phase 2.5).
//
// PURE TypeScript: no React, no DB, no store. Computed LIVE from existing task
// fields (completedAt / scheduledDate / status / effort) — there are no snapshot
// tables, per ADR-0001. Per-day momentum is delegated to the EXISTING
// computeEffortMomentum; we do not write new momentum math here. Goal-lineage
// grouping is deliberately NOT done here — that needs a repository lookup, so it
// is assembled in the store (an assembly concern, not pure math).
//
// REVIEW WINDOW (exact, do not redefine): the 7 full calendar days immediately
// before today — ends yesterday, starts 6 days before that. Today is excluded
// because it is still in progress and would understate "still open" counts.
// All day comparisons use LOCAL calendar days (scheduledDate is already a
// date-only local YYYY-MM-DD; completedAt is a timestamp we reduce to its local
// day), matching how the dashboard keys its windows.

import { format, parseISO, subDays } from 'date-fns'
import type { ISODate, Task } from '@/core/types'
import { computeEffortMomentum } from '@/engine/progress/computeEffortMomentum'

export interface DailyMomentumPoint {
  date: ISODate // date-only YYYY-MM-DD
  percent: number // 0–100, from computeEffortMomentum for that day
}

export interface WeeklyReviewData {
  windowStart: ISODate // date-only, oldest day in the window
  windowEnd: ISODate // date-only, yesterday
  completedTasks: Task[] // completedAt within the window
  missedTasks: Task[] // scheduled in the window, still open
  dailyMomentum: DailyMomentumPoint[] // 7 points, windowStart -> windowEnd
}

// The local calendar day (YYYY-MM-DD) a timestamp falls on.
function localDay(iso: ISODate): string {
  return format(parseISO(iso), 'yyyy-MM-dd')
}

export function computeWeeklyReview(tasks: Task[], now: Date): WeeklyReviewData {
  // The 7 window days, oldest first: now-7 .. now-1 (today, now-0, excluded).
  const days: string[] = []
  for (let i = 7; i >= 1; i--) {
    days.push(format(subDays(now, i), 'yyyy-MM-dd'))
  }
  const windowStart = days[0]
  const windowEnd = days[days.length - 1]

  // Date-only strings sort lexicographically by calendar order, so a plain
  // range check is correct.
  const inWindow = (day: string): boolean =>
    day >= windowStart && day <= windowEnd

  // Completed: completedAt falls within the window — counts even if the task was
  // scheduled for a different day (or never scheduled).
  const completedTasks = tasks.filter(
    (t) => t.completedAt !== undefined && inWindow(localDay(t.completedAt)),
  )

  // Missed: scheduled within the window and not completed. The window already
  // ends yesterday, so anything in it is by definition in the past relative to
  // today; we still gate on status so a task completed (any day) is never
  // counted as missed.
  const missedTasks = tasks.filter(
    (t) =>
      t.scheduledDate !== undefined &&
      inWindow(t.scheduledDate) &&
      t.status !== 'completed',
  )

  // One momentum percent per day, over the tasks scheduled for that day, via the
  // existing effort engine.
  const dailyMomentum: DailyMomentumPoint[] = days.map((date) => ({
    date,
    percent: computeEffortMomentum(
      tasks.filter((t) => t.scheduledDate === date),
    ).percent,
  }))

  return { windowStart, windowEnd, completedTasks, missedTasks, dailyMomentum }
}
