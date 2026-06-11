// TaskRow — a single task line.
//
// READ-ONLY this session: the leading icon reflects completion status but does
// NOT toggle yet. Toggling is a write (updateTask) that also needs the tree to
// refresh, so it is scoped to the next session to keep this one a clean render.
//
// Lives in features/goals/ for now. Move it to components/ when a second screen
// (e.g. the dashboard's "today" list) reuses it — not before (avoid premature
// reuse abstractions).

import { Circle, CheckCircle2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { Task } from '@/core/types'
import { PRIORITY_LABELS } from '@/core/constants'

interface TaskRowProps {
  task: Task
}

export function TaskRow({ task }: TaskRowProps) {
  const isDone = task.status === 'completed'
  // Only surface priority when it is high enough to matter, so routine tasks
  // stay visually quiet (calm-by-default UX).
  const showPriority = task.priority === 'high' || task.priority === 'critical'

  return (
    <div className="flex items-center gap-2.5 rounded-md px-1 py-1">
      <span className="shrink-0 text-app-text-muted" aria-hidden="true">
        {isDone ? <CheckCircle2 size={16} /> : <Circle size={16} />}
      </span>

      <span
        className={
          isDone
            ? 'flex-1 text-sm text-app-text-muted line-through'
            : 'flex-1 text-sm text-app-text'
        }
      >
        {task.title}
      </span>

      {showPriority ? (
        <span className="shrink-0 rounded-full border border-app-border px-2 py-0.5 text-[11px] text-app-text-muted">
          {PRIORITY_LABELS[task.priority]}
        </span>
      ) : null}

      {task.dueDate ? (
        <span className="shrink-0 text-[11px] text-app-text-muted">
          {format(parseISO(task.dueDate), 'd MMM')}
        </span>
      ) : null}
    </div>
  )
}