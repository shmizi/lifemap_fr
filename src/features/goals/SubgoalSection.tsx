// SubgoalSection — one subgoal as a collapsible card holding its milestones
// (each with their tasks) and any loose (milestone-less) tasks.
//
// Pure presentation: it receives a SubgoalTree and renders it. Expand/collapse
// is local UI state. The summary line counts milestones/tasks via array length
// only — that is display formatting, not the kind of progress/health
// calculation the data-flow rule reserves for the engine layer.

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { SubgoalTree } from '@/core/types'
import { SUBGOAL_STATUS_LABELS } from '@/core/constants'
import { MilestoneCard } from '@/features/goals/MilestoneCard'
import { TaskRow } from '@/features/goals/TaskRow'

interface SubgoalSectionProps {
  data: SubgoalTree
}

export function SubgoalSection({ data }: SubgoalSectionProps) {
  const { subgoal, milestones, looseTasks } = data
  // Default expanded so the hierarchy is visible at a glance for now. When goals
  // grow large, defaulting to collapsed may read calmer — revisit then.
  const [expanded, setExpanded] = useState(true)

  const milestoneCount = milestones.length
  const taskCount =
    looseTasks.length + milestones.reduce((sum, m) => sum + m.tasks.length, 0)
  const isEmpty = milestoneCount === 0 && looseTasks.length === 0

  return (
    <div className="rounded-app-lg border border-app-border bg-app-surface">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 rounded-app-lg p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
      >
        <span className="shrink-0 text-app-text-muted" aria-hidden="true">
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </span>

        <span className="flex-1">
          <span className="block font-medium text-app-text">{subgoal.title}</span>
          <span className="mt-0.5 block text-xs text-app-text-muted">
            {milestoneCount} milestone{milestoneCount === 1 ? '' : 's'} ·{' '}
            {taskCount} task{taskCount === 1 ? '' : 's'}
            {subgoal.targetDate
              ? ` · by ${format(parseISO(subgoal.targetDate), 'd MMM yyyy')}`
              : ''}
          </span>
        </span>

        <span className="shrink-0 rounded-full border border-app-border px-2.5 py-0.5 text-xs text-app-text-muted">
          {SUBGOAL_STATUS_LABELS[subgoal.status]}
        </span>
      </button>

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
        </div>
      ) : null}
    </div>
  )
}