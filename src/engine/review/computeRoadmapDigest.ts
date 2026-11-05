// computeRoadmapDigest — the bounded state snapshot fed to every rolling AI call
// (Phase 10). PURE TypeScript: no React, no DB, no store; time is INJECTED (now).
//
// THE PRINCIPLE (the user's sharpest worry — flat cost over a multi-year plan):
// the DATABASE is the memory; the prompt gets a small COMPUTED DIGEST, never the
// history. This snapshot's size is bounded by the plan's SHAPE (a few tracks, each
// a few phases) plus fixed counts — NOT by how many tasks have piled up over months.
// Hundreds of historical tasks stay in IndexedDB and are never serialized here, so a
// rolling call in month 1 and month 20 sees the same-sized context.
//
// What it carries:
//   • the STRUCTURE as titles + per-phase done/taskCount — position is derivable
//     (the first not-done phase of each track is "where you are"), surfaced as
//     `currentPhase` for convenience;
//   • a FIXED 2-week rollup of recent execution (completed vs missed COUNTS), the
//     Weekly-Review engine's exact window logic applied at a 14-day width.
// The Strategy Brief (also part of the bounded snapshot) is composed into prompts
// separately via renderStrategyBriefLines, so it is intentionally not duplicated here.

import { format, parseISO, subDays } from 'date-fns'
import type { GoalTree, ISODate, Task } from '@/core/types'
import { isOverdue } from '@/engine/planning/isOverdue'

// A 2-week window: today and the 13 days before it (matches computeWeeklyReview's
// "rolling window that includes today", just wider).
export const DIGEST_WINDOW_DAYS = 14

export interface DigestPhase {
  title: string
  done: boolean // the milestone is completed
  taskCount: number // bounded count, never the tasks themselves
}

export interface DigestTrack {
  title: string
  phases: DigestPhase[]
  // Where this track stands: the first not-yet-completed phase (by order), or null
  // when every phase is done.
  currentPhase: string | null
}

export interface RoadmapDigest {
  goalTitle: string
  tracks: DigestTrack[]
  // Fixed-width rollup of recent execution — COUNTS only, so it never grows with
  // history. `missed` excludes today (its open tasks aren't missed yet).
  recent: {
    windowStart: ISODate
    windowEnd: ISODate
    completed: number
    missed: number
  }
}

// The local calendar day (YYYY-MM-DD) a timestamp falls on (matches the review engine).
function localDay(iso: ISODate): string {
  return format(parseISO(iso), 'yyyy-MM-dd')
}

export function computeRoadmapDigest(tree: GoalTree, now: Date): RoadmapDigest {
  const tracks: DigestTrack[] = tree.subgoals.map((st) => {
    const ordered = [...st.milestones].sort(
      (a, b) => a.milestone.order - b.milestone.order,
    )
    const phases: DigestPhase[] = ordered.map((mt) => ({
      title: mt.milestone.title,
      done: mt.milestone.status === 'completed',
      taskCount: mt.tasks.length,
    }))
    const current = ordered.find((mt) => mt.milestone.status !== 'completed')
    return {
      title: st.subgoal.title,
      phases,
      currentPhase: current ? current.milestone.title : null,
    }
  })

  // Every task under the goal (loose + milestone), for the recent rollup. Flattened
  // here to COUNT, then discarded — no task list leaves this function.
  const allTasks: Task[] = tree.subgoals.flatMap((st) => [
    ...st.looseTasks,
    ...st.milestones.flatMap((m) => m.tasks),
  ])

  const windowStart = format(subDays(now, DIGEST_WINDOW_DAYS - 1), 'yyyy-MM-dd')
  const windowEnd = format(now, 'yyyy-MM-dd')
  const today = windowEnd
  const inWindow = (day: string): boolean =>
    day >= windowStart && day <= windowEnd

  // Completed: completedAt falls within the window (today counts).
  const completed = allTasks.filter(
    (t) => t.completedAt !== undefined && inWindow(localDay(t.completedAt)),
  ).length
  // Missed: scheduled on a window day that has ALREADY PASSED and still open (today
  // excluded — its open tasks aren't missed yet). Same rule as computeWeeklyReview.
  const missed = allTasks.filter(
    (t) =>
      t.scheduledDate !== undefined &&
      inWindow(t.scheduledDate) &&
      isOverdue(t, today),
  ).length

  return {
    goalTitle: tree.goal.title,
    tracks,
    recent: { windowStart, windowEnd, completed, missed },
  }
}

// Render the digest as compact prompt lines — the form a rolling AI call splices in
// (alongside renderStrategyBriefLines). Kept terse on purpose: it is context, not
// prose, and its length must stay bounded by the plan's shape.
export function renderDigestLines(digest: RoadmapDigest): string[] {
  const lines: string[] = ['Roadmap so far:']
  for (const track of digest.tracks) {
    const phaseParts = track.phases.map((p) => {
      const mark = p.done ? '✓' : '•'
      return `${mark} ${p.title} (${p.taskCount} task${p.taskCount === 1 ? '' : 's'})`
    })
    lines.push(`- ${track.title}: ${phaseParts.join('; ')}`)
    if (track.currentPhase) {
      lines.push(`  currently on: ${track.currentPhase}`)
    }
  }
  lines.push(
    `Last 2 weeks (${digest.recent.windowStart}–${digest.recent.windowEnd}): ${digest.recent.completed} done, ${digest.recent.missed} missed.`,
  )
  return lines
}
