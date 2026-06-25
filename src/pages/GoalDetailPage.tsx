// Goal Detail View — the first "real" deep page (Phase 1).
//
// WHY it only renders: it consumes one fully-assembled GoalTree via
// useGoalTree(id) and walks it into collapsible cards. It does NO database
// access and NO progress/health/priority calculation — the tree arrives already
// composed from the repository layer (hierarchyRepository.getGoalTree). Per the
// layered-complexity rule there is deliberately no graph here; that is a later
// phase. Lives in pages/ (route-level), pulling sub-parts from features/goals/.

import { type ReactNode, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, Sparkles } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ROUTES, GOAL_CATEGORY_OPTIONS } from '@/core/constants'
import { useGoalTree } from '@/core/hooks/useGoalTree'
import { useDependencyGraph } from '@/core/hooks/useDependencyGraph'
import { useGoalStore } from '@/store/useGoalStore'
import { ProgressRing } from '@/components/progress/ProgressRing'
import { SubgoalSection } from '@/features/goals/SubgoalSection'
import { SubgoalCreationModal } from '@/features/goals/SubgoalCreationModal'
import { SuggestedSubgoalsModal } from '@/features/goals/SuggestedSubgoalsModal'
import { GoalCreationModal } from '@/features/goals/GoalCreationModal'
import type { Goal } from '@/core/types'

function categoryLabel(value: Goal['category']): string {
  return GOAL_CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? value
}

export function GoalDetailPage() {
  // The /goals/:id route guarantees an id segment, but useParams types it as
  // possibly undefined; we normalise to '' and let the not-found branch handle
  // the (in practice unreachable) empty case.
  const { id = '' } = useParams<{ id: string }>()
  const { tree, isLoading } = useGoalTree(id)
  // The subgoal dependency graph (loaded here, passed down to each section).
  // Edges are global across goals; a section filters to its own subgoal by id.
  // Keyed on the goal's subgoal-id set so that deleting a subgoal (which
  // cascade-removes its edges in the DB via useGoalStore) forces a reload here,
  // dropping any now-dangling edges rather than showing a phantom "Unknown
  // subgoal" row.
  const subgoalIdsKey = tree
    ? tree.subgoals.map((st) => st.subgoal.id).join(',')
    : ''
  const { dependencies: subgoalDependencies } = useDependencyGraph(
    'subgoal',
    subgoalIdsKey,
  )
  // Whole-goal momentum, derived from the same tree by the store. Shown in the
  // header above the per-subgoal rings; hidden until the goal has tasks.
  const goalProgress = useGoalStore((s) => s.currentGoalProgress)
  const [isAddSubgoalOpen, setIsAddSubgoalOpen] = useState(false)
  const [isSuggestSubgoalsOpen, setIsSuggestSubgoalsOpen] = useState(false)
  const [isEditGoalOpen, setIsEditGoalOpen] = useState(false)

  if (isLoading) {
    return (
      <section className="mx-auto max-w-3xl">
        <BackLink />
        <CenteredNote>Loading goal...</CenteredNote>
      </section>
    )
  }

  if (!tree) {
    return (
      <section className="mx-auto max-w-3xl">
        <BackLink />
        <CenteredNote>
          This goal could not be found. It may have been deleted.
        </CenteredNote>
      </section>
    )
  }

  const { goal, subgoals } = tree
  // Flat {id, title} list of this goal's subgoals, for each section's dependency
  // picker and supporter-title lookup.
  const allSubgoals = subgoals.map((st) => ({
    id: st.subgoal.id,
    title: st.subgoal.title,
  }))

  return (
    <section className="mx-auto max-w-3xl">
      <BackLink />

      {/* Goal header */}
      <header className="mt-4 rounded-app-lg border border-app-border bg-app-surface p-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold text-app-text">{goal.title}</h1>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-app-border px-2.5 py-0.5 text-xs text-app-text-muted">
              {categoryLabel(goal.category)}
            </span>
            <button
              type="button"
              onClick={() => setIsEditGoalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-app-lg border border-app-border px-3 py-1.5 text-sm font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              <Pencil size={14} />
              Edit
            </button>
          </div>
        </div>

        {goal.description ? (
          <p className="mt-3 text-sm text-app-text-muted">{goal.description}</p>
        ) : null}

        {/* Whole-goal momentum — the calm ring mirrors the per-subgoal rings
            below it. Hidden when the goal has no tasks (nothing to show yet). */}
        {goalProgress.total > 0 ? (
          <div className="mt-4 flex items-center gap-3">
            <ProgressRing
              percent={goalProgress.percent}
              size={48}
              strokeWidth={5}
              ariaLabel={`${goalProgress.completed} of ${goalProgress.total} tasks complete`}
            />
            <span className="text-sm text-app-text-muted">
              {goalProgress.completed} of {goalProgress.total} tasks done
            </span>
          </div>
        ) : null}

        <p className="mt-4 text-xs text-app-text-muted">
          Target {format(parseISO(goal.targetDate), 'd MMM yyyy')}
        </p>
      </header>

      {/* Subgoals */}
      <div className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-app-text-muted">
            Subgoals
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSuggestSubgoalsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-app-lg border border-app-border px-3 py-1.5 text-sm font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              <Sparkles size={15} />
              Suggest subgoals
            </button>
            <button
              type="button"
              onClick={() => setIsAddSubgoalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-app-lg border border-app-border px-3 py-1.5 text-sm font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              <Plus size={15} />
              Add subgoal
            </button>
          </div>
        </div>

        {subgoals.length === 0 ? (
          <div className="mt-3 rounded-app-lg border border-dashed border-app-border bg-app-surface p-8 text-center">
            <p className="text-sm text-app-text-muted">
              No subgoals yet. Break this goal into the major parts it depends on.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsAddSubgoalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
              >
                <Plus size={16} />
                Add your first subgoal
              </button>
              <button
                type="button"
                onClick={() => setIsSuggestSubgoalsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-app-lg border border-app-border px-4 py-2 text-sm font-semibold text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
              >
                <Sparkles size={16} />
                Suggest subgoals
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {subgoals.map((subgoalTree) => (
              <SubgoalSection
                key={subgoalTree.subgoal.id}
                data={subgoalTree}
                goalTitle={goal.title}
                allSubgoals={allSubgoals}
                subgoalDependencies={subgoalDependencies}
              />
            ))}
          </div>
        )}
      </div>

      <SubgoalCreationModal
        goalId={goal.id}
        open={isAddSubgoalOpen}
        onClose={() => setIsAddSubgoalOpen(false)}
      />

      {/* AI-suggested subgoals for this goal (accept / edit / reject). */}
      <SuggestedSubgoalsModal
        goalId={goal.id}
        open={isSuggestSubgoalsOpen}
        onClose={() => setIsSuggestSubgoalsOpen(false)}
        context={{
          goalTitle: goal.title,
          goalDescription: goal.description,
          goalCategory: categoryLabel(goal.category),
          existingSubgoalTitles: subgoals.map((st) => st.subgoal.title),
        }}
      />

      {/* Edit THIS goal. */}
      <GoalCreationModal
        goal={goal}
        open={isEditGoalOpen}
        onClose={() => setIsEditGoalOpen(false)}
      />
    </section>
  )
}

function BackLink() {
  return (
    <Link
      to={ROUTES.GOALS}
      className="inline-flex items-center gap-1.5 rounded text-sm text-app-text-muted transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
    >
      <ArrowLeft size={16} />
      All goals
    </Link>
  )
}

function CenteredNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 rounded-app-lg border border-app-border bg-app-surface p-10 text-center text-sm text-app-text-muted">
      {children}
    </div>
  )
}