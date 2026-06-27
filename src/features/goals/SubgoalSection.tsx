// SubgoalSection — one subgoal as a collapsible card: header (expand toggle +
// status + edit/delete), and when expanded its milestones, loose tasks, and the
// "add milestone" / "add task" affordances.
//
// Mostly presentation. Local state: expand/collapse + which modal is open. The
// only direct store call is removeSubgoal (delete); edits and child-creation go
// through their respective modals. The header row is a `group` so the edit/delete
// actions reveal on hover. Counts use array .length only — display formatting,
// not engine-level progress calculation.

import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Sparkles,
  CalendarClock,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { Dependency, ID, MilestoneStatus, SubgoalTree } from '@/core/types'
import { SUBGOAL_STATUS_LABELS, DEFAULT_DAILY_MINUTES } from '@/core/constants'
import { useGoalStore } from '@/store/useGoalStore'
import { RowActions } from '@/components/ui/RowActions'
import { ProgressRing } from '@/components/progress/ProgressRing'
import { MilestoneCard } from '@/features/goals/MilestoneCard'
import { MilestoneCreationModal } from '@/features/goals/MilestoneCreationModal'
import { SuggestedMilestonesModal } from '@/features/goals/SuggestedMilestonesModal'
import { DailyPlanModal } from '@/features/goals/DailyPlanModal'
import { TaskCreationModal } from '@/features/goals/TaskCreationModal'
import { SubgoalCreationModal } from '@/features/goals/SubgoalCreationModal'
import { SubgoalDependencies } from '@/features/goals/SubgoalDependencies'
import { TaskRow } from '@/features/goals/TaskRow'

interface SubgoalSectionProps {
  data: SubgoalTree
  // The parent goal's title — context the AI milestone suggester needs (the
  // subgoal alone is ambiguous without the goal it serves). Passed from the page.
  goalTitle: string
  // Every subgoal in this goal (for the dependency picker + title lookup) and
  // the loaded subgoal-type edges. Both come from the page, which owns the
  // single dependency-graph load.
  allSubgoals: { id: ID; title: string }[]
  subgoalDependencies: Dependency[]
}

export function SubgoalSection({
  data,
  goalTitle,
  allSubgoals,
  subgoalDependencies,
}: SubgoalSectionProps) {
  const { subgoal, milestones, looseTasks } = data
  const removeSubgoal = useGoalStore((s) => s.removeSubgoal)
  // Engine-computed momentum for this subgoal (the store derives it from the
  // tree). Absent or task-less subgoals show no ring, keeping the header calm.
  const progress = useGoalStore((s) => s.subgoalProgress[subgoal.id])
  const showRing = progress !== undefined && progress.total > 0

  // Default expanded so the hierarchy is visible at a glance for now.
  const [expanded, setExpanded] = useState(true)
  const [isAddMilestoneOpen, setIsAddMilestoneOpen] = useState(false)
  const [isSuggestOpen, setIsSuggestOpen] = useState(false)
  const [isDailyPlanOpen, setIsDailyPlanOpen] = useState(false)
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)

  // Celebrate milestones that auto-complete while this section is COLLAPSED.
  // Their MilestoneCard isn't mounted then, so it can't catch the live
  // transition — but SubgoalSection stays mounted and still receives status
  // updates. We diff statuses here and, on re-expand, tell those cards to play
  // the flourish as they appear. While expanded, the cards catch their own
  // transitions, so we record nothing.
  const prevStatuses = useRef<Record<string, MilestoneStatus>>({})
  const [pendingCelebrations, setPendingCelebrations] = useState<Set<ID>>(
    new Set(),
  )

  useEffect(() => {
    if (!expanded) {
      setPendingCelebrations((prev) => {
        let next = prev
        for (const { milestone } of milestones) {
          const was = prevStatuses.current[milestone.id]
          if (
            was !== undefined &&
            was !== 'completed' &&
            milestone.status === 'completed'
          ) {
            if (next === prev) next = new Set(prev)
            next.add(milestone.id)
          }
        }
        return next
      })
    }
    // Remember the current statuses (regardless of expand state) for the next diff.
    const snapshot: Record<string, MilestoneStatus> = {}
    for (const { milestone } of milestones) {
      snapshot[milestone.id] = milestone.status
    }
    prevStatuses.current = snapshot
  }, [milestones, expanded])

  // Expand/collapse. Pending celebrations are only ever shown while expanded, so
  // by the time the user collapses they've already played — clear them here, in
  // the handler, so a later expand doesn't replay them (and so this reset is a
  // plain event-handler setState, not a set-state-in-effect).
  function toggleExpanded() {
    if (expanded && pendingCelebrations.size > 0) {
      setPendingCelebrations(new Set())
    }
    setExpanded((v) => !v)
  }

  const milestoneCount = milestones.length
  const taskCount =
    looseTasks.length + milestones.reduce((sum, m) => sum + m.tasks.length, 0)
  const isEmpty = milestoneCount === 0 && looseTasks.length === 0

  // Whether this subgoal is either end of any dependency edge — if so, deleting
  // it also removes those edges (handled atomically in the repository), so the
  // delete confirmation says so.
  const participatesInDeps = subgoalDependencies.some(
    (e) => e.fromId === subgoal.id || e.toId === subgoal.id,
  )

  // Minutes per session for this subgoal's daily plan (its own setting, or the
  // gentle default). The plan's start day + length are derived in the store from
  // the subgoal's existing tasks + deadline, not here.
  const dailyMinutes = subgoal.estimatedDailyMinutes ?? DEFAULT_DAILY_MINUTES

  return (
    <div className="rounded-app-lg border border-app-border bg-app-surface">
      <div className="group flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={expanded}
          className="flex flex-1 items-center gap-3 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        >
          <span className="shrink-0 text-app-text-muted" aria-hidden="true">
            {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </span>
          <span className="flex-1">
            <span className="block font-medium text-app-text">
              {subgoal.title}
            </span>
            <span className="mt-0.5 block text-xs text-app-text-muted">
              {milestoneCount} milestone{milestoneCount === 1 ? '' : 's'} ·{' '}
              {taskCount} task{taskCount === 1 ? '' : 's'}
              {subgoal.targetDate
                ? ` · by ${format(parseISO(subgoal.targetDate), 'd MMM yyyy')}`
                : ''}
            </span>
          </span>
        </button>

        {showRing ? (
          <ProgressRing
            percent={progress.percent}
            size={34}
            ariaLabel={`${progress.completed} of ${progress.total} tasks complete`}
          />
        ) : null}

        <span className="shrink-0 rounded-full border border-app-border px-2.5 py-0.5 text-xs text-app-text-muted">
          {SUBGOAL_STATUS_LABELS[subgoal.status]}
        </span>

        <RowActions
          entityLabel="subgoal"
          onEdit={() => setIsEditOpen(true)}
          onDelete={() => removeSubgoal(subgoal.id)}
          confirmHint={
            participatesInDeps ? 'Dependency links removed too.' : undefined
          }
        />
      </div>

      {expanded ? (
        <div className="space-y-3 border-t border-app-border p-4">
          {milestones.map((milestoneTree) => (
            <MilestoneCard
              key={milestoneTree.milestone.id}
              data={milestoneTree}
              // Guard with the current status so a complete-then-reopen while
              // collapsed doesn't celebrate a milestone that's no longer done.
              celebrateOnAppear={
                pendingCelebrations.has(milestoneTree.milestone.id) &&
                milestoneTree.milestone.status === 'completed'
              }
            />
          ))}

          {looseTasks.length > 0 ? (
            <div className="space-y-1">
              {milestoneCount > 0 ? (
                <p className="text-xs font-medium uppercase tracking-wide text-app-text-muted">
                  Other tasks
                </p>
              ) : null}
              {looseTasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          ) : null}

          {isEmpty ? (
            <p className="text-sm text-app-text-muted">
              No milestones or tasks yet.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsAddMilestoneOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-app-lg border border-app-border px-3 py-1.5 text-xs font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              <Plus size={14} />
              Add milestone
            </button>
            <button
              type="button"
              onClick={() => setIsSuggestOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-app-lg border border-app-border px-3 py-1.5 text-xs font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              <Sparkles size={14} />
              Suggest milestones
            </button>
            <button
              type="button"
              onClick={() => setIsAddTaskOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-app-lg border border-app-border px-3 py-1.5 text-xs font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              <Plus size={14} />
              Add task
            </button>
            {/* Daily plan is only meaningful for consistency subgoals (practiced
                a fixed amount every day). */}
            {subgoal.requiresConsistency ? (
              <button
                type="button"
                onClick={() => setIsDailyPlanOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-app-lg border border-app-border px-3 py-1.5 text-xs font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
              >
                <CalendarClock size={14} />
                Daily plan
              </button>
            ) : null}
          </div>

          <SubgoalDependencies
            subgoalId={subgoal.id}
            allSubgoals={allSubgoals}
            edges={subgoalDependencies}
          />
        </div>
      ) : null}

      {/* Create milestone under this subgoal. */}
      <MilestoneCreationModal
        subgoalId={subgoal.id}
        open={isAddMilestoneOpen}
        onClose={() => setIsAddMilestoneOpen(false)}
      />

      {/* AI-suggested milestones for this subgoal (accept / edit / reject). */}
      <SuggestedMilestonesModal
        subgoalId={subgoal.id}
        open={isSuggestOpen}
        onClose={() => setIsSuggestOpen(false)}
        context={{
          goalTitle,
          subgoalTitle: subgoal.title,
          subgoalDescription: subgoal.description,
          existingMilestoneTitles: milestones.map((m) => m.milestone.title),
        }}
      />

      {/* AI daily plan for a consistency subgoal (preview / accept dated tasks). */}
      {subgoal.requiresConsistency ? (
        <DailyPlanModal
          open={isDailyPlanOpen}
          onClose={() => setIsDailyPlanOpen(false)}
          request={{
            subgoalId: subgoal.id,
            subgoalTitle: subgoal.title,
            subgoalDescription: subgoal.description,
            goalTitle,
            dailyMinutes,
            ...(subgoal.targetDate ? { targetDate: subgoal.targetDate } : {}),
          }}
        />
      ) : null}

      {/* Create a loose task (no milestoneId) directly under this subgoal. */}
      <TaskCreationModal
        subgoalId={subgoal.id}
        open={isAddTaskOpen}
        onClose={() => setIsAddTaskOpen(false)}
      />

      {/* Edit THIS subgoal. */}
      <SubgoalCreationModal
        subgoal={subgoal}
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
      />
    </div>
  )
}