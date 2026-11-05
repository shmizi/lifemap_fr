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
import type {
  Dependency,
  ID,
  MilestoneStatus,
  SubgoalTree,
  Task,
} from '@/core/types'
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
import { TaskRow } from '@/features/goals/TaskRow'
import { SubgoalDependencies } from '@/features/goals/SubgoalDependencies'
import { partitionScheduledAndBacklog } from '@/engine/planning/partitionTasks'
import { isSubgoalWorkDone } from '@/engine/progress/isSubgoalWorkDone'

interface SubgoalSectionProps {
  data: SubgoalTree
  // The parent goal's id — so the AI suggesters can fetch that goal's intake
  // context (Phase 9). Passed from the page.
  goalId: ID
  // The parent goal's title — context the AI milestone suggester needs (the
  // subgoal alone is ambiguous without the goal it serves). Passed from the page.
  goalTitle: string
  // Every subgoal in this goal (id + title), for the "Depends on" picker. Loaded
  // once by the page rather than per-section.
  allSubgoals: { id: ID; title: string }[]
  // The loaded SOFT subgoal dependency graph (all edges, not just this subgoal's —
  // the panel filters to its own supporters by toId).
  subgoalEdges: Dependency[]
}

export function SubgoalSection({
  data,
  goalId,
  goalTitle,
  allSubgoals,
  subgoalEdges,
}: SubgoalSectionProps) {
  const { subgoal, milestones, looseTasks } = data
  const removeSubgoal = useGoalStore((s) => s.removeSubgoal)
  const setSubgoalComplete = useGoalStore((s) => s.setSubgoalComplete)
  const [isCompleting, setIsCompleting] = useState(false)
  // Two-step only when open tasks would move: nothing surprising happens silently.
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)
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

  const isCompleted = subgoal.status === 'completed'
  const openDatedCount = [...looseTasks, ...milestones.flatMap((m) => m.tasks)].filter(
    (t) => t.status !== 'completed' && t.scheduledDate !== undefined,
  ).length
  const workDone = isSubgoalWorkDone(data)

  async function applyComplete(complete: boolean) {
    setIsCompleting(true)
    setCompleteError(null)
    try {
      await setSubgoalComplete(subgoal.id, complete)
      setConfirmComplete(false)
    } catch {
      setCompleteError('Could not update this subgoal. Please try again.')
    } finally {
      setIsCompleting(false)
    }
  }

  function handleCompleteClick() {
    if (isCompleted) void applyComplete(false)
    else if (openDatedCount > 0) setConfirmComplete(true)
    else void applyComplete(true)
  }

  const milestoneCount = milestones.length
  const taskCount =
    looseTasks.length + milestones.reduce((sum, m) => sum + m.tasks.length, 0)
  const isEmpty = milestoneCount === 0 && looseTasks.length === 0

  // When collapsed, still surface the single most-urgent open task so "what's next"
  // stays visible without expanding. Computed across loose + milestone tasks.
  const nextTask = pickNextTask([
    ...looseTasks,
    ...milestones.flatMap((m) => m.tasks),
  ])

  // Split this subgoal's loose tasks into the dated plan and the undated "Later"
  // backlog (Phase 10). The backlog informs here but never nags on the dashboard
  // (its day-keyed lists query the scheduledDate index, which undated rows aren't
  // in). Milestone tasks keep their own grouping — a milestone is its own phase.
  const { scheduled: scheduledLooseTasks, backlog: backlogLooseTasks } =
    partitionScheduledAndBacklog(looseTasks)

  // Phase 10 auto-advance: the next phase to plan is the first milestone that isn't
  // completed yet. As each phase is finished (its milestone auto-completes), this
  // marker marches forward to the following phase — so the moment a phase wraps, the
  // next one is surfaced as "up next", ready to expand into tasks.
  const nextPhaseId = [...milestones]
    .sort((a, b) => a.milestone.order - b.milestone.order)
    .find((mt) => mt.milestone.status !== 'completed')?.milestone.id

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

        <button
          type="button"
          onClick={handleCompleteClick}
          disabled={isCompleting}
          className="shrink-0 border border-app-border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-app-text transition hover:bg-app-surface-alt disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        >
          {isCompleting ? 'Saving…' : isCompleted ? 'Reopen' : 'Mark complete'}
        </button>

        <RowActions
          entityLabel="subgoal"
          onEdit={() => setIsEditOpen(true)}
          onDelete={() => removeSubgoal(subgoal.id)}
        />
      </div>

      {confirmComplete ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-app-border px-4 py-2 text-xs text-app-text">
          <span className="flex-1">
            {openDatedCount} open task{openDatedCount === 1 ? '' : 's'} will move to
            &ldquo;Later&rdquo; and leave your schedule. Nothing is deleted.
          </span>
          <button
            type="button"
            onClick={() => void applyComplete(true)}
            disabled={isCompleting}
            className="bg-app-text px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-app-surface transition hover:opacity-90 disabled:opacity-60"
          >
            Complete it
          </button>
          <button
            type="button"
            onClick={() => setConfirmComplete(false)}
            disabled={isCompleting}
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-app-text-muted transition hover:text-app-text"
          >
            Cancel
          </button>
        </div>
      ) : workDone && !isCompleted ? (
        <p className="border-t border-app-border px-4 py-2 text-xs text-app-text-muted">
          All the work here is done. Mark it complete?
        </p>
      ) : null}
      {completeError ? (
        <p className="border-t border-app-border px-4 py-2 text-xs text-red-600">
          {completeError}
        </p>
      ) : null}

      {/* Collapsed peek: the nearest-due open task stays in view so you can act on
          it (or tick it off) without expanding the whole subgoal. */}
      {!expanded && nextTask ? (
        <div className="border-t border-app-border px-4 py-2">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-app-text-muted">
            Next up
          </p>
          <TaskRow task={nextTask} />
        </div>
      ) : null}

      {expanded ? (
        <div className="space-y-3 border-t border-app-border p-4">
          {milestones.map((milestoneTree) => (
            <MilestoneCard
              key={milestoneTree.milestone.id}
              data={milestoneTree}
              goalId={goalId}
              // Guard with the current status so a complete-then-reopen while
              // collapsed doesn't celebrate a milestone that's no longer done.
              celebrateOnAppear={
                pendingCelebrations.has(milestoneTree.milestone.id) &&
                milestoneTree.milestone.status === 'completed'
              }
              // "Up next" only when this is the current phase AND it still needs
              // planning (no tasks yet) — a phase already in progress isn't nudged.
              isNextPhase={
                milestoneTree.milestone.id === nextPhaseId &&
                milestoneTree.tasks.length === 0
              }
              nextTaskId={nextTask?.id}
            />
          ))}

          {scheduledLooseTasks.length > 0 ? (
            <div className="space-y-1">
              {milestoneCount > 0 ? (
                <p className="text-xs font-medium uppercase tracking-wide text-app-text-muted">
                  Other tasks
                </p>
              ) : null}
              {scheduledLooseTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isNext={task.id === nextTask?.id}
                />
              ))}
            </div>
          ) : null}

          {/* Undated "Later" backlog — parked work with no calendar date yet. Shown
              calmly (informs) but it never appears on the dashboard's daily lists. */}
          {backlogLooseTasks.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-app-text-muted">
                Later · not scheduled
              </p>
              {backlogLooseTasks.map((task) => (
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

          {/* The SOFT "Depends on" links — which sibling subgoals strengthen this
              one. Informational only (never blocks starting or finishing work), and
              it renders nothing when there is no sibling to link to. This is the one
              place edges are created, so it is what feeds the lagging-foundation
              note, the priority dependency boost, and the weekly review's
              strengthened-foundations line. */}
          <SubgoalDependencies
            subgoalId={subgoal.id}
            allSubgoals={allSubgoals}
            edges={subgoalEdges}
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
          goalId,
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
            goalId,
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

// The one open task to preview when a subgoal is collapsed: the incomplete task
// with the earliest effective date (scheduledDate, else dueDate). Undated tasks
// sort last; ties keep input order. Returns undefined when nothing is open.
function pickNextTask(tasks: Task[]): Task | undefined {
  const open = tasks.filter((t) => t.status !== 'completed')
  if (open.length === 0) return undefined
  const dateOf = (t: Task): string =>
    t.scheduledDate ?? t.dueDate ?? '9999-99-99'
  return open.reduce((best, t) => (dateOf(t) < dateOf(best) ? t : best))
}