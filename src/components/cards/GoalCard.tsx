// GoalCard — pure presentation of a single Goal in the goals list.
//
// WHY it lives in components/cards and takes a plain Goal prop: it holds zero
// business logic. It does not fetch, calculate progress, or compute health
// (those are engine concerns in later phases). It only renders what it is given
// and links to that goal's detail page. Staying dumb means it can be reused
// anywhere a goal needs to be shown.

import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
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

  return (
    <Link
      to={goalDetailPath(goal.id)}
      onClick={() => setSelectedGoalId(goal.id)}
      className="group block rounded-app-lg border border-app-border bg-app-surface p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
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

      <div className="mt-4 text-xs text-app-text-muted">
        Target {format(parseISO(goal.targetDate), 'd MMM yyyy')}
      </div>
    </Link>
  )
}
