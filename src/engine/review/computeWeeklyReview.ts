// computeWeeklyReview — the pure data behind the Weekly Review page (Phase 2.5).
//
// PURE TypeScript: no React, no DB, no store. Computed LIVE from existing task
// fields (completedAt / scheduledDate / status / effort) — there are no snapshot
// tables, per ADR-0001. Per-day momentum is delegated to the EXISTING
// computeEffortMomentum; we do not write new momentum math here. Goal-lineage
// grouping is deliberately NOT done here — that needs a repository lookup, so it
// is assembled in the store (an assembly concern, not pure math).
//
// REVIEW WINDOW (exact, do not redefine): a rolling 7 calendar days that INCLUDES
// today — starts 6 days before today, ends today. Today counts for completed work
// and daily momentum. The one carve-out: today's still-open scheduled tasks are
// NOT counted as "missed" (the day isn't over yet), so a task only reads as missed
// once its day has fully passed. All day comparisons use LOCAL calendar days
// (scheduledDate is already a date-only local YYYY-MM-DD; completedAt is a
// timestamp we reduce to its local day), matching how the dashboard keys windows.

import { format, parseISO, subDays } from 'date-fns'
import type { ISODate, Task } from '@/core/types'
import { computeEffortMomentum } from '@/engine/progress/computeEffortMomentum'

export interface DailyMomentumPoint {
  date: ISODate // date-only YYYY-MM-DD
  percent: number // 0–100, from computeEffortMomentum for that day
}

export interface WeeklyReviewData {
  windowStart: ISODate // date-only, oldest day in the window (today - 6)
  windowEnd: ISODate // date-only, today
  completedTasks: Task[] // completedAt within the window (today included)
  missedTasks: Task[] // scheduled in a PAST window day, still open (today excluded)
  dailyMomentum: DailyMomentumPoint[] // 7 points, windowStart -> today
}

// The local calendar day (YYYY-MM-DD) a timestamp falls on.
function localDay(iso: ISODate): string {
  return format(parseISO(iso), 'yyyy-MM-dd')
}

export function computeWeeklyReview(tasks: Task[], now: Date): WeeklyReviewData {
  // The 7 window days, oldest first: now-6 .. now (today INCLUDED).
  const days: string[] = []
  for (let i = 6; i >= 0; i--) {
    days.push(format(subDays(now, i), 'yyyy-MM-dd'))
  }
  const windowStart = days[0]
  const windowEnd = days[days.length - 1] // today
  const today = windowEnd

  // Date-only strings sort lexicographically by calendar order, so a plain
  // range check is correct.
  const inWindow = (day: string): boolean =>
    day >= windowStart && day <= windowEnd

  // Completed: completedAt falls within the window — counts even if the task was
  // scheduled for a different day (or never scheduled). Today's completions count.
  const completedTasks = tasks.filter(
    (t) => t.completedAt !== undefined && inWindow(localDay(t.completedAt)),
  )

  // Missed: scheduled on a window day that has ALREADY PASSED and still open.
  // Today is deliberately excluded — its open tasks aren't missed yet (the day is
  // still in progress); they simply haven't been done. Status gates out anything
  // already completed.
  const missedTasks = tasks.filter(
    (t) =>
      t.scheduledDate !== undefined &&
      inWindow(t.scheduledDate) &&
      t.scheduledDate < today &&
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
