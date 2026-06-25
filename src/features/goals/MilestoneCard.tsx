// MilestoneCard — one milestone: its title/status, edit+delete actions, its
// tasks, and an "add task" affordance.
//
// Mostly presentation; the only writes are via store actions (delete) and the
// two modals (edit milestone, add task). Not independently collapsible — the
// SubgoalSection above already provides the expand/collapse layer. The header is
// a `group` so the edit/delete actions reveal on hover.

import { useEffect, useRef, useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import type { MilestoneTree } from '@/core/types'
import { MILESTONE_STATUS_LABELS } from '@/core/constants'
import { useGoalStore } from '@/store/useGoalStore'
import { RowActions } from '@/components/ui/RowActions'
import { TaskRow } from '@/features/goals/TaskRow'
import { TaskCreationModal } from '@/features/goals/TaskCreationModal'
import { MilestoneCreationModal } from '@/features/goals/MilestoneCreationModal'
import { MilestoneCelebration } from '@/components/animations/MilestoneCelebration'

// How long the completion flourish stays on screen before it clears (ms).
const CELEBRATION_MS = 1400

interface MilestoneCardProps {
  data: MilestoneTree
  // True when this milestone completed while its section was COLLAPSED: the card
  // wasn't mounted to catch the live transition, so it should play the flourish
  // as it appears (on re-expand). SubgoalSection decides this.
  celebrateOnAppear?: boolean
}

export function MilestoneCard({
  data,
  celebrateOnAppear = false,
}: MilestoneCardProps) {
  const { milestone, tasks } = data
  const removeMilestone = useGoalStore((s) => s.removeMilestone)
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)

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
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-app-text-muted">No tasks yet.</p>
      )}

      <button
        type="button"
        onClick={() => setIsAddTaskOpen(true)}
        className="mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-app-text-muted transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
      >
        <Plus size={13} />
        Add task
      </button>

      {/* Create task under THIS milestone. */}
      <TaskCreationModal
        subgoalId={milestone.subgoalId}
        milestoneId={milestone.id}
        open={isAddTaskOpen}
        onClose={() => setIsAddTaskOpen(false)}
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