// TaskRow — a single task line: completion toggle, title, priority/date, and
// (on hover/focus) edit + delete actions.
//
// Connected to the store for the toggle/edit/delete actions; it holds no
// business logic. The leading icon toggles completion; RowActions opens the edit
// modal or deletes. Safe to use buttons here because TaskRow is never inside a
// link. The outer row is a `group` so RowActions can reveal on hover.

import { useState } from 'react'
import { Circle, CheckCircle2, CalendarDays, Repeat } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { Task } from '@/core/types'
import { PRIORITY_LABELS } from '@/core/constants'
import { useGoalStore } from '@/store/useGoalStore'
import { RowActions } from '@/components/ui/RowActions'
import { TaskCreationModal } from '@/features/goals/TaskCreationModal'

interface TaskRowProps {
  task: Task
}

export function TaskRow({ task }: TaskRowProps) {
  const toggleTaskComplete = useGoalStore((s) => s.toggleTaskComplete)
  const removeTask = useGoalStore((s) => s.removeTask)
  const [isToggling, setIsToggling] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)

  const isDone = task.status === 'completed'
  const showPriority = task.priority === 'high' || task.priority === 'critical'

  async function handleToggle() {
    if (isToggling) return
    setIsToggling(true)
    try {
      await toggleTaskComplete(task)
    } finally {
      setIsToggling(false)
    }
  }

  return (
    <div className="group flex items-center gap-2.5 rounded-md px-1 py-1">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isToggling}
        aria-pressed={isDone}
        aria-label={
          isDone ? 'Mark task as not complete' : 'Mark task as complete'
        }
        className={`shrink-0 rounded-full transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30 disabled:opacity-50 ${
          isDone ? 'text-app-text' : 'text-app-text-muted'
        }`}
      >
        {isDone ? <CheckCircle2 size={16} /> : <Circle size={16} />}
      </button>

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

      {/* Recurring marker — a task the user repeats regularly. Icon-only chip to
          keep the row calm; the title says what it is. */}
      {task.isRecurring ? (
        <span
          className="flex shrink-0 items-center rounded-full border border-app-border px-1.5 py-0.5 text-app-text-muted"
          title="Recurring task"
          aria-label="Recurring task"
        >
          <Repeat size={11} aria-hidden />
        </span>
      ) : null}

      {/* Scheduled-date chip — marks tasks that appear on the Today list so they
          read as "scheduled" in the goal tree too. scheduledDate is date-only
          (YYYY-MM-DD); parseISO reads it as local midnight, which is correct for a
          calendar-day value. The calendar icon distinguishes it from the bare
          due-date text that follows. */}
      {task.scheduledDate ? (
        <span
          className="flex shrink-0 items-center gap-1 rounded-full border border-app-border px-2 py-0.5 text-[11px] text-app-text-muted"
          title={`Scheduled for ${format(parseISO(task.scheduledDate), 'd MMM yyyy')}`}
        >
          <CalendarDays size={11} aria-hidden />
          {format(parseISO(task.scheduledDate), 'd MMM')}
        </span>
      ) : null}

      {task.dueDate ? (
        <span className="shrink-0 text-[11px] text-app-text-muted">
          {format(parseISO(task.dueDate), 'd MMM')}
        </span>
      ) : null}

      <RowActions
        entityLabel="task"
        onEdit={() => setIsEditOpen(true)}
        onDelete={() => removeTask(task.id)}
      />

      <TaskCreationModal
        task={task}
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
      />
    </div>
  )
}