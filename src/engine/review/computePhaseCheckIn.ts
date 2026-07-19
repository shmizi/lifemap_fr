// computePhaseCheckIn — the pure data behind a phase-end CHECK-IN (Phase 10).
//
// A "phase" is a MILESTONE (the canonical Phase 10 mapping: Track = Subgoal,
// Phase = Milestone). When a phase reaches its end, the coach checks in with the
// user; the vision's beat (1) is "what you did this phase". This computes exactly
// that recap, PURELY: no React, no DB, no store, and — like the whole review
// engine family — it invents no new momentum math, it reuses computeEffortMomentum
// so "how much got done" means the same effort-weighted thing everywhere.
//
// This owns the detection + recap (beat 1). Beat (2) light re-intake is a UI
// scaffold; beat (3) next-phase expansion is wired in the store/page (it expands
// the NEXT milestone via generatePhaseTasks) — not here, since this stays pure.
//
// Nothing is time-injected: a phase recap is bounded by the phase's own tasks,
// not a rolling window, so there is no "now" to read (contrast computeWeeklyReview,
// whose 7-day window genuinely needs today).

import { format, parseISO } from 'date-fns'
import type { ISODate, MilestoneTree, Task } from '@/core/types'
import { computeEffortMomentum } from '@/engine/progress/computeEffortMomentum'
import type { Completion } from '@/engine/progress/computeCompletion'

export interface PhaseCheckInData {
  phaseTitle: string
  // Whether the phase has reached its end and a check-in is warranted: the
  // milestone is explicitly marked completed, OR it has tasks and none are open.
  // An empty phase (no tasks yet) is never "complete" — there is nothing to recap.
  phaseComplete: boolean
  totalTasks: number
  completedTasks: Task[]
  // Still-open tasks — empty when the phase finished cleanly, otherwise the work
  // that was left behind (surfaced so the check-in can name it, not hide it).
  outstandingTasks: Task[]
  // Effort-weighted recap of the phase (reuses the momentum engine, not a raw
  // task count). completed/total are effort units; percent is 0–100.
  completion: Completion
  // The calendar span the phase actually occupied — earliest / latest of every
  // dated signal across its tasks. Null when the phase has no dated tasks at all.
  spanStart: ISODate | null
  spanEnd: ISODate | null
}

// The local calendar day (YYYY-MM-DD) a timestamp falls on. scheduledDate is
// already date-only; completedAt is a timestamp we reduce to its local day so
// both contribute to the span on the same footing (matches computeWeeklyReview).
function localDay(iso: ISODate): string {
  return format(parseISO(iso), 'yyyy-MM-dd')
}

export function computePhaseCheckIn(phase: MilestoneTree): PhaseCheckInData {
  const { milestone, tasks } = phase

  const completedTasks = tasks.filter((t) => t.status === 'completed')
  const outstandingTasks = tasks.filter((t) => t.status !== 'completed')

  const phaseComplete =
    milestone.status === 'completed' ||
    (tasks.length > 0 && outstandingTasks.length === 0)

  const completion = computeEffortMomentum(tasks)

  // Earliest / latest of every dated signal (a task's scheduled day and its
  // completion day). Date-only strings sort lexicographically by calendar order.
  const dayStamps: string[] = []
  for (const t of tasks) {
    if (t.scheduledDate) dayStamps.push(t.scheduledDate)
    if (t.completedAt) dayStamps.push(localDay(t.completedAt))
  }
  dayStamps.sort()
  const spanStart = dayStamps.length > 0 ? dayStamps[0] : null
  const spanEnd = dayStamps.length > 0 ? dayStamps[dayStamps.length - 1] : null

  return {
    phaseTitle: milestone.title,
    phaseComplete,
    totalTasks: tasks.length,
    completedTasks,
    outstandingTasks,
    completion,
    spanStart,
    spanEnd,
  }
}
