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
          <span className="shrink-0 rounded-full border border-app-border px-2.5 py-0.5 text-xs text-app-text-muted">
            {categoryLabel(goal.category)}
          </span>
        </div>

        {goal.description ? (
          <p className="mt-2 line-clamp-2 text-sm text-app-text-muted">
            {goal.description}
          </p>
        ) : null}

        {/* Right padding leaves room for the delete control in this row. */}
        <div className="mt-4 pr-20 text-xs text-app-text-muted">
          Target {format(parseISO(goal.targetDate), 'd MMM yyyy')}
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
            className="rounded-md p-1.5 text-app-text-muted opacity-0 transition hover:text-red-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30 group-hover:opacity-100"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  )
}