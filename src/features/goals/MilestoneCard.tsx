// MilestoneCard — one milestone: its title/status, edit+delete actions, its
// tasks, and an "add task" affordance.
//
// Mostly presentation; the only writes are via store actions (delete) and the
// two modals (edit milestone, add task). Not independently collapsible — the
// SubgoalSection above already provides the expand/collapse layer. The header is
// a `group` so the edit/delete actions reveal on hover.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Sparkles, ArrowRight, PartyPopper } from 'lucide-react'
import type { ID, MilestoneTree } from '@/core/types'
import { MILESTONE_STATUS_LABELS, phaseCheckInPath } from '@/core/constants'
import { useGoalStore } from '@/store/useGoalStore'
import { RowActions } from '@/components/ui/RowActions'
import { TaskRow } from '@/features/goals/TaskRow'
import { TaskCreationModal } from '@/features/goals/TaskCreationModal'
import { MilestoneCreationModal } from '@/features/goals/MilestoneCreationModal'
import { PhaseTasksReviewModal } from '@/features/goals/PhaseTasksReviewModal'
import { MilestoneCelebration } from '@/components/animations/MilestoneCelebration'

// How long the completion flourish stays on screen before it clears (ms).
const CELEBRATION_MS = 1400

interface MilestoneCardProps {
  data: MilestoneTree
  // The parent goal's id — needed to build the phase-end check-in link. Passed
  // down from SubgoalSection (which owns the goal context).
  goalId: ID
  // True when this milestone completed while its section was COLLAPSED: the card
  // wasn't mounted to catch the live transition, so it should play the flourish
  // as it appears (on re-expand). SubgoalSection decides this.
  celebrateOnAppear?: boolean
  // True when this is the CURRENT phase awaiting planning (Phase 10 auto-advance):
  // the first not-yet-completed milestone that still has no tasks. Surfaced as
  // "up next" with an emphasised plan CTA so finishing a phase reveals the next.
  isNextPhase?: boolean
  // Id of the soonest still-open task across the WHOLE parent subgoal. Passed
  // through so whichever phase happens to hold it marks that row; the decision is
  // the subgoal's to make, since "next" is only meaningful across all its phases.
  nextTaskId?: ID
}

export function MilestoneCard({
  data,
  goalId,
  celebrateOnAppear = false,
  isNextPhase = false,
  nextTaskId,
}: MilestoneCardProps) {
  const { milestone, tasks } = data
  const removeMilestone = useGoalStore((s) => s.removeMilestone)
  // When this phase is finished, offer the phase-end check-in (Phase 10). The recap
  // is derived by the engine and held in the store, keyed by this milestone's id.
  const phaseComplete = useGoalStore(
    (s) => s.phaseCheckIns[milestone.id]?.phaseComplete ?? false,
  )
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  // Phase 10, Stage 3 — expand this phase into dated tasks, reviewed before writing.
  const [isPlanReviewOpen, setIsPlanReviewOpen] = useState(false)

  // Seed `celebrate` from celebrateOnAppear so a milestone that completed while
  // hidden plays its flourish the moment it mounts. The ref seeds with the
  // current status so an already-completed milestone never celebrates on its own.
  const prevStatus = useRef(milestone.status)
  const [celebrate, setCelebrate] = useState(celebrateOnAppear)

  // Clear the flourish after it has played, whichever path started it.
  useEffect(() => {
    if (!celebrate) return
    const timer = setTimeout(() => setCelebrate(false), CELEBRATION_MS)
    return () => clearTimeout(timer)
  }, [celebrate])

  // Catch a LIVE active -> completed transition (section expanded, the auto-
  // completion rule just flipped this milestone).
  useEffect(() => {
    if (milestone.status === 'completed' && prevStatus.current !== 'completed') {
      setCelebrate(true)
    }
    prevStatus.current = milestone.status
  }, [milestone.status])

  return (
    <div className="relative rounded-app-lg border border-app-border p-3">
      <MilestoneCelebration show={celebrate} />
      <div className="group flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium text-app-text">{milestone.title}</h4>
        <div className="flex items-center gap-2">
          {/* Phase-end check-in: this phase is finished — recap it and expand the
              next phase (Phase 10 heartbeat). */}
          {phaseComplete ? (
            <Link
              to={phaseCheckInPath(goalId, milestone.id)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-app-border px-2.5 py-0.5 text-[11px] font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              <PartyPopper size={11} aria-hidden="true" />
              Check in
            </Link>
          ) : null}
          {/* Auto-advance cue: this phase is the next one to plan. */}
          {isNextPhase ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-app-text px-2 py-0.5 text-[11px] font-medium text-app-surface">
              <ArrowRight size={11} aria-hidden="true" />
              Up next
            </span>
          ) : null}
          {/* Provenance: surface that this checkpoint came from an AI suggestion
              the user accepted (the only place aiSuggested is set). Calm and
              non-actionable — it informs, it doesn't change behaviour. */}
          {milestone.aiSuggested ? (
            <span
              title="Suggested by AI"
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-app-border px-2 py-0.5 text-[11px] text-app-text-muted"
            >
              <Sparkles size={11} aria-hidden="true" />
              AI
            </span>
          ) : null}
          <span className="shrink-0 rounded-full border border-app-border px-2 py-0.5 text-[11px] text-app-text-muted">
            {MILESTONE_STATUS_LABELS[milestone.status]}
          </span>
          <RowActions
            entityLabel="milestone"
            onEdit={() => setIsEditOpen(true)}
            onDelete={() => removeMilestone(milestone.id)}
          />
        </div>
      </div>

      {tasks.length > 0 ? (
        <div className="mt-2 space-y-1">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} isNext={task.id === nextTaskId} />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-app-text-muted">No tasks yet.</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {/* Stage 3: turn an undated phase into a couple of weeks of dated tasks.
            Offered only while the phase is empty — once it has tasks, the subgoal's
            rolling top-up keeps it going. */}
        {tasks.length === 0 ? (
          <button
            type="button"
            onClick={() => setIsPlanReviewOpen(true)}
            className={
              isNextPhase
                ? 'inline-flex items-center gap-1 rounded-md bg-app-text px-2.5 py-1 text-xs font-semibold text-app-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'
                : 'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-app-text-muted transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'
            }
          >
            <Sparkles size={13} />
            {isNextPhase ? 'Plan this phase' : 'Plan tasks with AI'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setIsAddTaskOpen(true)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-app-text-muted transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        >
          <Plus size={13} />
          Add task
        </button>
      </div>

      {/* Create task under THIS milestone. */}
      <TaskCreationModal
        subgoalId={milestone.subgoalId}
        milestoneId={milestone.id}
        open={isAddTaskOpen}
        onClose={() => setIsAddTaskOpen(false)}
      />

      {/* Review the AI-proposed dated tasks for this phase before they're written. */}
      <PhaseTasksReviewModal
        milestoneId={milestone.id}
        milestoneTitle={milestone.title}
        open={isPlanReviewOpen}
        onClose={() => setIsPlanReviewOpen(false)}
      />

      {/* Edit THIS milestone. */}
      <MilestoneCreationModal
        milestone={milestone}
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
      />
    </div>
  )
}