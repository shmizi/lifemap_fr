// Roadmap page — shows ONE goal's subgoals laid out in dependency order, so the
// user can see which parts support others and in what sequence momentum builds
// (Phase 4, read-only).
//
// WHY one goal at a time: per the strategy the roadmap starts simple (ordered
// "station" cards, not a heavy graph) and scoped to a single goal — it reuses the
// data path the app already has rather than introducing a cross-goal getter. The
// richer "metro map" is a later visual upgrade over the SAME engine output.
//
// Smart only in that it is store-connected: it loads the goal list for the
// selector and reads the assembled roadmap via useRoadmap. No DB access, no graph
// math, and no editing here — creating/removing dependencies stays on Goal Detail.

import { type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useGoalStore } from '@/store/useGoalStore'
import { useRoadmap } from '@/core/hooks/useRoadmap'
import { RoadmapView } from '@/features/roadmap/RoadmapView'
import { ROUTES } from '@/core/constants'

export function RoadmapPage() {
  const goals = useGoalStore((s) => s.goals)
  const isLoadingGoals = useGoalStore((s) => s.isLoadingGoals)
  const loadGoals = useGoalStore((s) => s.loadGoals)
  const selectedGoalId = useGoalStore((s) => s.selectedGoalId)

  const [picked, setPicked] = useState('')

  useEffect(() => {
    void loadGoals()
  }, [loadGoals])

  // The shown goal: the user's manual pick if it still exists, otherwise a
  // sensible default — the goal they were last focused on (if present), else the
  // first. Derived during render rather than synced into state via an effect, so
  // there's no set-state churn and no flicker before the default lands.
  const goalId =
    picked && goals.some((g) => g.id === picked)
      ? picked
      : (goals.find((g) => g.id === selectedGoalId)?.id ?? goals[0]?.id ?? '')

  const { roadmap, isLoading } = useRoadmap(goalId)
  // The store holds one roadmap at a time; while switching goals the previous
  // one lingers for a beat. Only render once the loaded roadmap matches the pick.
  const ready = roadmap !== null && roadmap.goalId === goalId

  return (
    <section className="mx-auto max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold text-app-text">Roadmap</h1>
        <p className="mt-1 text-app-text-muted">
          How a goal&apos;s subgoals support one another, in the order that builds
          momentum.
        </p>
      </header>

      {isLoadingGoals && goals.length === 0 ? (
        <CenteredNote>Loading your goals...</CenteredNote>
      ) : goals.length === 0 ? (
        <div className="mt-8 rounded-app-lg border border-dashed border-app-border bg-app-surface p-10 text-center">
          <h2 className="text-base font-semibold text-app-text">
            No goals to map yet
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-app-text-muted">
            Create a goal and break it into subgoals first — the roadmap shows how
            those subgoals connect.
          </p>
          <Link
            to={ROUTES.GOALS}
            className="mt-5 inline-flex items-center gap-2 rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          >
            Go to goals
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <label
              htmlFor="roadmap-goal"
              className="text-xs font-medium uppercase tracking-wide text-app-text-muted"
            >
              Goal
            </label>
            <select
              id="roadmap-goal"
              value={goalId}
              onChange={(e) => setPicked(e.target.value)}
              className="mt-1.5 w-full rounded-app border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
          </div>

          {isLoading && !ready ? (
            <CenteredNote>Mapping subgoals...</CenteredNote>
          ) : ready ? (
            <RoadmapView view={roadmap} />
          ) : null}
        </>
      )}
    </section>
  )
}

function CenteredNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 rounded-app-lg border border-app-border bg-app-surface p-10 text-center text-sm text-app-text-muted">
      {children}
    </div>
  )
}
