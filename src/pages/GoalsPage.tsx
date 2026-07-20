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
import { RegistryPage, RegistryReadout, RegistryButton } from '@/components/ui/Registry'

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
    <RegistryPage
      kicker="LifeMap — Register"
      title="Goals"
      subtitle="The long-term outcomes you are working toward"
      readout={<RegistryReadout value={goals.length} label="On the register" />}
      actions={
        <RegistryButton onClick={() => setIsCreateOpen(true)}>
          <Plus size={14} />
          New goal
        </RegistryButton>
      }
    >
      {isLoadingGoals && goals.length === 0 ? (
        <LoadingState />
      ) : goals.length === 0 ? (
        <EmptyState onCreate={() => setIsCreateOpen(true)} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {goals.map((goal, i) => (
            <GoalCard key={goal.id} goal={goal} index={i} />
          ))}
        </div>
      )}

      <GoalCreationModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </RegistryPage>
  )
}

// An empty screen is an invitation to act, not a dead end (per the UX rules).
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="border border-dashed border-app-border bg-app-surface p-12 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-app-text-muted">
        The register is empty
      </p>
      <h2 className="mt-3 font-display text-xl font-semibold text-app-text">No goals yet</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-app-text-muted">
        Start with one long-term outcome that matters to you. You can break it
        into subgoals, milestones, and tasks once it exists.
      </p>
      <RegistryButton onClick={onCreate} className="mt-5">
        <Plus size={14} />
        Create your first goal
      </RegistryButton>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="border border-app-border bg-app-surface p-12 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-app-text-muted">
      Reading the register…
    </div>
  )
}