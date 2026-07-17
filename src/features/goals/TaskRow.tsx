// TaskRow — a single task line: completion toggle, title, priority/date, and
// (on hover/focus) edit + delete actions.
//
// Connected to the store for the toggle/edit/delete actions; it holds no
// business logic. The leading icon toggles completion; RowActions opens the edit
// modal or deletes. Safe to use buttons here because TaskRow is never inside a
// link. The outer row is a `group` so RowActions can reveal on hover.

import { useState } from 'react'
import {
  Circle,
  CheckCircle2,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Clock,
  Repeat,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { Task } from '@/core/types'
import { PRIORITY_LABELS } from '@/core/constants'
import { googleCalendarUrl } from '@/core/utils/googleCalendar'
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
  // Disclosure: the title expands a small panel explaining what the task actually
  // asks for (its description) and how long it should take. Collapsed by default so
  // the list stays a calm run of one-liners.
  const [detailOpen, setDetailOpen] = useState(false)

  const isDone = task.status === 'completed'
  const showPriority = task.priority === 'high' || task.priority === 'critical'
  // Only offer the disclosure when there is something to reveal.
  const hasDetail =
    Boolean(task.description) || task.estimatedMinutes !== undefined

  // A task with a day on it can be dropped straight into Google Calendar (no API,
  // just a prefilled "create event" link). Prefer the scheduled day, else the due
  // date; the block length comes from the task's estimate.
  const calendarDate = task.scheduledDate ?? task.dueDate
  const calendarHref = calendarDate
    ? googleCalendarUrl({
        title: task.title,
        date: calendarDate,
        details: task.description,
        durationMinutes: task.estimatedMinutes,
      })
    : null

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
    <div>
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

      {hasDetail ? (
        <button
          type="button"
          onClick={() => setDetailOpen((v) => !v)}
          aria-expanded={detailOpen}
          title={detailOpen ? 'Hide details' : 'Show details'}
          className={`flex flex-1 items-center gap-1 rounded text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30 ${
            isDone ? 'text-app-text-muted' : 'text-app-text'
          }`}
        >
          <ChevronRight
            size={13}
            aria-hidden
            className={`shrink-0 text-app-text-muted transition-transform ${
              detailOpen ? 'rotate-90' : ''
            }`}
          />
          <span className={isDone ? 'line-through' : ''}>{task.title}</span>
        </button>
      ) : (
        <span
          className={
            isDone
              ? 'flex-1 text-sm text-app-text-muted line-through'
              : 'flex-1 text-sm text-app-text'
          }
        >
          {task.title}
        </span>
      )}

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

      {calendarHref ? (
        <a
          href={calendarHref}
          target="_blank"
          rel="noopener noreferrer"
          title="Add to Google Calendar"
          aria-label="Add to Google Calendar"
          className="flex shrink-0 items-center rounded-full border border-app-border px-1.5 py-0.5 text-app-text-muted transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        >
          <CalendarPlus size={12} aria-hidden />
        </a>
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

    {/* Disclosure panel: what this task actually asks for, and its effort. Indented
        to align under the title (past the 16px toggle + gap). */}
    {detailOpen && hasDetail ? (
      <div className="mb-1 ml-[26px] rounded-md border border-app-border bg-app-surface-alt px-3 py-2">
        {task.description ? (
          <p className="text-xs leading-relaxed text-app-text-muted">
            {task.description}
          </p>
        ) : (
          <p className="text-xs italic text-app-text-muted">
            No extra detail — the title is the whole task. Mark it done when it's
            finished.
          </p>
        )}
        {task.estimatedMinutes !== undefined ? (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-app-text-muted">
            <Clock size={11} aria-hidden />
            About {task.estimatedMinutes} min
          </p>
        ) : null}
      </div>
    ) : null}
    </div>
  )
}