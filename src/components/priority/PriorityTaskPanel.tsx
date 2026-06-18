// PriorityTaskPanel — a small, calm "worth focusing on" panel for the dashboard.
//
// Pure presentation: it takes an already-ranked list of tasks (the priority
// engine does the scoring in the store) and renders each with the shared
// TaskRow. No store, no engine, no ranking here — the dashboard passes the slice
// in. Renders nothing when there is nothing to focus on, so a caught-up user
// sees no empty box.
//
// Framing is deliberately gentle: this is a focus SUGGESTION, not a warning. No
// "urgent", no red/alarm styling — those would undercut the product's calm tone.
//
// TaskRow lives in features/goals/; imported directly here, the same way
// DashboardTaskSection consumes it.

import type { Task } from '@/core/types'
import { TaskRow } from '@/features/goals/TaskRow'

interface PriorityTaskPanelProps {
  tasks: Task[]
}

export function PriorityTaskPanel({ tasks }: PriorityTaskPanelProps) {
  if (tasks.length === 0) return null

  return (
    <section className="rounded-app-lg border border-app-border bg-app-surface p-6">
      <h2 className="text-lg font-semibold text-app-text">Worth focusing on</h2>
      <p className="mt-1 text-sm text-app-text-muted">
        A few tasks across all your goals that look most worth your attention
        right now.
      </p>

      <div className="mt-4 space-y-1">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </div>
    </section>
  )
}
