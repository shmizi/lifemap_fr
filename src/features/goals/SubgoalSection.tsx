// SubgoalSection — one subgoal as a collapsible card: header (expand toggle +
// status + edit/delete), and when expanded its milestones, loose tasks, and the
// "add milestone" / "add task" affordances.
//
// Mostly presentation. Local state: expand/collapse + which modal is open. The
// only direct store call is removeSubgoal (delete); edits and child-creation go
// through their respective modals. The header row is a `group` so the edit/delete
// actions reveal on hover. Counts use array .length only — display formatting,
// not engine-level progress calculation.

import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { SubgoalTree } from '@/core/types'
import { SUBGOAL_STATUS_LABELS } from '@/core/constants'
import { useGoalStore } from '@/store/useGoalStore'
import { RowActions } from '@/components/ui/RowActions'
import { MilestoneCard } from '@/features/goals/MilestoneCard'
import { MilestoneCreationModal } from '@/features/goals/MilestoneCreationModal'
import { TaskCreationModal } from '@/features/goals/TaskCreationModal'
import { SubgoalCreationModal } from '@/features/goals/SubgoalCreationModal'
import { TaskRow } from '@/features/goals/TaskRow'

interface SubgoalSectionProps {
  data: SubgoalTree
}

export function SubgoalSection({ data }: SubgoalSectionProps) {
  const { subgoal, milestones, looseTasks } = data
  const removeSubgoal = useGoalStore((s) => s.removeSubgoal)

  // Default expanded so the hierarchy is visible at a glance for now.
  const [expanded, setExpanded] = useState(true)
  const [isAddMilestoneOpen, setIsAddMilestoneOpen] = useState(false)
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)

  const milestoneCount = milestones.length
  const taskCount =
    looseTasks.length + milestones.reduce((sum, m) => sum + m.tasks.length, 0)
  const isEmpty = milestoneCount === 0 && looseTasks.length === 0

  return (
    <div className="rounded-app-lg border border-app-border bg-app-surface">
      <div className="group flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
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

        <span className="shrink-0 rounded-full border border-app-border px-2.5 py-0.5 text-xs text-app-text-muted">
          {SUBGOAL_STATUS_LABELS[subgoal.status]}
        </span>

        <RowActions
          entityLabel="subgoal"
          onEdit={() => setIsEditOpen(true)}
          onDelete={() => removeSubgoal(subgoal.id)}
        />
      </div>

      {expanded ? (
        <div className="space-y-3 border-t border-app-border p-4">
          {milestones.map((milestoneTree) => (
            <MilestoneCard
              key={milestoneTree.milestone.id}
              data={milestoneTree}
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
              onClick={() => setIsAddTaskOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-app-lg border border-app-border px-3 py-1.5 text-xs font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              <Plus size={14} />
              Add task
            </button>
          </div>
        </div>
      ) : null}

      {/* Create milestone under this subgoal. */}
      <MilestoneCreationModal
        subgoalId={subgoal.id}
        open={isAddMilestoneOpen}
        onClose={() => setIsAddMilestoneOpen(false)}
      />

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