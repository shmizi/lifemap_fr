// GoalCard — presentation of a single Goal in the goals list, plus a delete
// affordance.
//
// WHY it lives in components/cards and stays thin: it holds no business logic —
// no fetching, no progress/health calculation (those are engine concerns in
// later phases). It renders what it is given, links to the goal's detail page,
// and offers a guarded delete. Local confirm/deleting flags are transient UI
// state, which belongs in the component, not the store.
//
// WHY the delete button is a sibling of the Link, not inside it: a <button>
// nested in an <a> is invalid HTML and clicking it would also trigger the link's
// navigation. So the card is a container; the Link is the main clickable area
// and the delete control sits on top of it.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Trash2 } from 'lucide-react'
import type { Goal } from '@/core/types'
import { goalDetailPath, GOAL_CATEGORY_OPTIONS } from '@/core/constants'
import { useGoalStore } from '@/store/useGoalStore'
import { ProgressRing } from '@/components/progress/ProgressRing'
import { GoalHealthBadge } from '@/components/cards/GoalHealthBadge'

interface GoalCardProps {
  goal: Goal
}

// Look up the display label for a category; fall back to the raw value so a
// category added later still renders something sensible.
function categoryLabel(value: Goal['category']): string {
  return GOAL_CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? value
}

export function GoalCard({ goal }: GoalCardProps) {
  const setSelectedGoalId = useGoalStore((s) => s.setSelectedGoalId)
  const removeGoal = useGoalStore((s) => s.removeGoal)
  // Engine-computed momentum for this goal (the store builds it on load). May be
  // absent for a brand-new goal until the next list refresh; treated as no ring.
  const progress = useGoalStore((s) => s.goalProgress[goal.id])
  // A goal with no tasks has no momentum to show — keep the card calm, no ring.
  const showRing = progress !== undefined && progress.total > 0
  // Engine-computed health (same load pass as progress). Carries TWO separate
  // signals: pace (status/score) and the dependency "lagging foundation" note.
  // Pace is hidden for a goal with no tasks ('no_tasks').
  const health = useGoalStore((s) => s.goalHealth[goal.id])
  // The dependency note is meaningless for a finished goal (a completed/archived
  // goal isn't waiting on any foundation), so it follows the same gating as the
  // pace badge below.
  const isFinished = goal.status === 'completed' || goal.status === 'archived'

  // Two-step delete: idle -> confirming -> (delete | cancel). The confirm step
  // matters because deletion is destructive and there is no undo.
  const [confirming, setConfirming] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete() {
    setIsDeleting(true)
    try {
      await removeGoal(goal.id)
      // No reset needed on success: removing the goal unmounts this card.
    } catch {
      // On failure, return the card to a usable state so the user can retry.
      setIsDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <div className="group relative rounded-app-lg border border-app-border bg-app-surface transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-within:shadow-lg">
      <Link
        to={goalDetailPath(goal.id)}
        onClick={() => setSelectedGoalId(goal.id)}
        className="block rounded-app-lg p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-app-text">{goal.title}</h3>
          <div className="flex shrink-0 items-center gap-2">
            {/* Pace health is meaningless for a finished goal — a completed or
                archived goal is done, not "on track" — so the badge is hidden
                for those (and for goals with no tasks to assess). */}
            {health && health.status !== 'no_tasks' && !isFinished ? (
              <GoalHealthBadge status={health.status} />
            ) : null}
            <span className="rounded-full border border-app-border px-2.5 py-0.5 text-xs text-app-text-muted">
              {categoryLabel(goal.category)}
            </span>
          </div>
        </div>

        {goal.description ? (
          <p className="mt-2 line-clamp-2 text-sm text-app-text-muted">
            {goal.description}
          </p>
        ) : null}

        {/* Dependency health signal — SEPARATE from the pace badge and explained
            on its own line: a foundation subgoal is trailing the work that leans
            on it. A calm amber nudge (not a red siren), hidden for finished goals.
            Sits above the date row so it never overlaps the delete control. */}
        {health?.laggingFoundation && !isFinished ? (
          <p className="mt-3 text-xs text-amber-600">
            Foundation lagging: {health.laggingFoundation.foundationTitle} is
            trailing {health.laggingFoundation.dependentTitle}, which builds on
            it.
          </p>
        ) : null}

        {/* Right padding leaves room for the delete control in this row. The
            ring sits beside the target date so momentum and deadline read
            together; it is hidden for a goal with no tasks. */}
        <div className="mt-4 flex items-center gap-3 pr-20 text-xs text-app-text-muted">
          {showRing ? (
            <ProgressRing
              percent={progress.percent}
              ariaLabel={`${progress.completed} of ${progress.total} tasks complete`}
            />
          ) : null}
          <span>Target {format(parseISO(goal.targetDate), 'd MMM yyyy')}</span>
        </div>
      </Link>

      {/* Delete control — sibling of the Link. Hidden until hover or keyboard
          focus to keep the card calm by default (desktop-first per the strategy;
          a mobile-friendly affordance comes with the mobile pass). */}
      <div className="absolute bottom-3 right-3">
        {confirming ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:opacity-50"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={isDeleting}
              className="rounded-md px-2 py-1 text-xs font-medium text-app-text-muted transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Delete goal: ${goal.title}`}
            className="rounded-md p-1.5 text-app-text-muted transition hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30 can-hover:opacity-0 can-hover:focus-visible:opacity-100 can-hover:group-hover:opacity-100"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  )
}