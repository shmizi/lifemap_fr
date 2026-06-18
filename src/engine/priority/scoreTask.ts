// scoreTask — rule-based importance score for a single task (Phase 2).
//
// PURE TypeScript: no React, no DB, no store, no side effects. Given a task and
// the current moment, it returns a numeric "worth doing now" score; higher means
// more deserving of attention. rankTasks uses this to surface a small focus list
// on the dashboard, independent of whether a task is scheduled for today.
//
// The score is built ONLY from signals that genuinely exist on a Task today:
//   - priority      : the user's deliberate low/medium/high/critical choice
//   - dueDate       : deadline urgency (overdue > due today > due soon > later)
//   - scheduledDate : a planned work day that has arrived (or passed)
// There is intentionally no milestone/subgoal-importance term: those entities
// carry no importance field, so we cannot read one without inventing schema.
// Weights are deliberately spread so a nearer deadline can outrank a higher
// priority — a focus list is driven first by what is time-sensitive.

import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { ISODate, Priority, Task } from '@/core/types'

// The user-set priority is the strongest deliberate signal of importance.
const PRIORITY_WEIGHT: Record<Priority, number> = {
  low: 0,
  medium: 10,
  high: 25,
  critical: 40,
}

// Deadline urgency from dueDate, relative to today (calendar days).
const DEADLINE_OVERDUE = 50 // past due — the most time-sensitive
const DEADLINE_TODAY = 35
const DEADLINE_SOON = 20 // within DEADLINE_SOON_DAYS
const DEADLINE_LATER = 8 // within DEADLINE_LATER_DAYS
const DEADLINE_SOON_DAYS = 3
const DEADLINE_LATER_DAYS = 7

// A planned work day (scheduledDate) that has arrived nudges a task up a little —
// smaller than a true deadline, since it is a plan, not a hard date.
const SCHEDULED_DUE_OR_PAST = 15 // scheduled for today or earlier
const SCHEDULED_SOON = 6 // scheduled within DEADLINE_SOON_DAYS

function deadlineScore(dueDate: ISODate | undefined, now: Date): number {
  if (!dueDate) return 0
  // parseISO reads a date-only 'YYYY-MM-DD' as local midnight; calendar-day diff
  // ignores the time-of-day in `now`, so "due today" is 0 all day.
  const days = differenceInCalendarDays(parseISO(dueDate), now)
  if (days < 0) return DEADLINE_OVERDUE
  if (days === 0) return DEADLINE_TODAY
  if (days <= DEADLINE_SOON_DAYS) return DEADLINE_SOON
  if (days <= DEADLINE_LATER_DAYS) return DEADLINE_LATER
  return 0
}

function scheduleScore(scheduledDate: ISODate | undefined, now: Date): number {
  if (!scheduledDate) return 0
  const days = differenceInCalendarDays(parseISO(scheduledDate), now)
  if (days <= 0) return SCHEDULED_DUE_OR_PAST
  if (days <= DEADLINE_SOON_DAYS) return SCHEDULED_SOON
  return 0
}

export function scoreTask(task: Task, now: Date): number {
  return (
    PRIORITY_WEIGHT[task.priority] +
    deadlineScore(task.dueDate, now) +
    scheduleScore(task.scheduledDate, now)
  )
}
