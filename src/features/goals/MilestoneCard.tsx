// MilestoneCard — one milestone and its tasks.
//
// Pure presentation: receives a MilestoneTree and renders it. Deliberately NOT
// independently collapsible — the SubgoalSection above already provides the
// expand/collapse layer, and nesting a second collapse here would add depth
// without much benefit (keep it simple per the layered-complexity rule).

import type { MilestoneTree } from '@/core/types'
import { MILESTONE_STATUS_LABELS } from '@/core/constants'
import { TaskRow } from '@/features/goals/TaskRow'

interface MilestoneCardProps {
  data: MilestoneTree
}

export function MilestoneCard({ data }: MilestoneCardProps) {
  const { milestone, tasks } = data

  return (
    <div className="rounded-app-lg border border-app-border p-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium text-app-text">{milestone.title}</h4>
        <span className="shrink-0 rounded-full border border-app-border px-2 py-0.5 text-[11px] text-app-text-muted">
          {MILESTONE_STATUS_LABELS[milestone.status]}
        </span>
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
    </div>
  )
}