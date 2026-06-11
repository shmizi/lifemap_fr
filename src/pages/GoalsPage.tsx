// Goals page — lists the user's goals and lets them create new ones.
//
// WHY this is now real content (replacing the Phase 0 placeholder): Phase 1
// makes the planning hierarchy usable, and the goals list is its entry point —
// where a user creates a goal and clicks into its detail view.
//
// Lives in pages/ (the route-level component) and pulls in feature pieces from
// features/goals/. It is "smart" only in that it is connected to the store: it
// triggers loadGoals and reads goals[]. No business logic, no DB access, and no
// progress/health calculation here (those are engine concerns later).

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useGoalStore } from '@/store/useGoalStore'
import { GoalCard } from '@/components/cards/GoalCard'
import { GoalCreationModal } from '@/features/goals/GoalCreationModal'

export function GoalsPage() {
  const goals = useGoalStore((s) => s.goals)
  const isLoadingGoals = useGoalStore((s) => s.isLoadingGoals)
  const loadGoals = useGoalStore((s) => s.loadGoals)

  const [isCreateOpen, setIsCreateOpen] = useState(false)

  // Load the list once on mount. loadGoals is a stable store action.
  useEffect(() => {
    void loadGoals()
  }, [loadGoals])

  return (
    <section className="mx-auto max-w-3xl">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-app-text">Goals</h1>
          <p className="mt-1 text-app-text-muted">
            The long-term outcomes you are working toward.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        >
          <Plus size={16} />
          New goal
        </button>
      </header>

      <div className="mt-8">
        {isLoadingGoals && goals.length === 0 ? (
          <LoadingState />
        ) : goals.length === 0 ? (
          <EmptyState onCreate={() => setIsCreateOpen(true)} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {goals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        )}
      </div>

      <GoalCreationModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </section>
  )
}

// An empty screen is an invitation to act, not a dead end (per the UX rules).
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-app-lg border border-dashed border-app-border bg-app-surface p-10 text-center">
      <h2 className="text-base font-semibold text-app-text">No goals yet</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-app-text-muted">
        Start with one long-term outcome that matters to you. You can break it
        into subgoals, milestones, and tasks once it exists.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex items-center gap-2 rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
      >
        <Plus size={16} />
        Create your first goal
      </button>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="rounded-app-lg border border-app-border bg-app-surface p-10 text-center text-sm text-app-text-muted">
      Loading your goals...
    </div>
  )
}