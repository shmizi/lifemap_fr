// MilestoneCard — one milestone: its title/status, edit+delete actions, its
// tasks, and an "add task" affordance.
//
// Mostly presentation; the only writes are via store actions (delete) and the
// two modals (edit milestone, add task). Not independently collapsible — the
// SubgoalSection above already provides the expand/collapse layer. The header is
// a `group` so the edit/delete actions reveal on hover.

import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { MilestoneTree } from '@/core/types'
import { MILESTONE_STATUS_LABELS } from '@/core/constants'
import { useGoalStore } from '@/store/useGoalStore'
import { RowActions } from '@/components/ui/RowActions'
import { TaskRow } from '@/features/goals/TaskRow'
import { TaskCreationModal } from '@/features/goals/TaskCreationModal'
import { MilestoneCreationModal } from '@/features/goals/MilestoneCreationModal'

interface MilestoneCardProps {
  data: MilestoneTree
}

export function MilestoneCard({ data }: MilestoneCardProps) {
  const { milestone, tasks } = data
  const removeMilestone = useGoalStore((s) => s.removeMilestone)
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)

  return (
    <div className="rounded-app-lg border border-app-border p-3">
      <div className="group flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium text-app-text">{milestone.title}</h4>
        <div className="flex items-center gap-2">
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