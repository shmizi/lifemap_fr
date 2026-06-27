// TaskCreationModal — create OR edit a task.
//
// Pass `task` to edit it. To create: pass subgoalId (always) and milestoneId
// (only when the task sits under a specific milestone; omit for a loose task).
// The overlay/panel shell lives in the shared <Modal> component; the form body
// lives in <TaskForm>, mounted fresh each open so its fields seed from props via
// useState initializers (no set-state-in-effect re-seed). Writes go through
// addTask / editTask (the store owns order). Edit patches only
// title/priority/effort/dueDate/scheduledDate/description/isRecurring and, when the
// subgoal has milestones, the task's milestone (reassignment) — status,
// completedAt, etc. are preserved.

import { useMemo, useState, type ReactNode } from 'react'
import type { EffortSize, ID, Priority, Task } from '@/core/types'
import {
  DEFAULT_TASK_STATUS,
  DEFAULT_TASK_PRIORITY,
  DEFAULT_TASK_EFFORT,
  PRIORITY_OPTIONS,
  EFFORT_OPTIONS,
} from '@/core/constants'
import { useGoalStore } from '@/store/useGoalStore'
import { Modal } from '@/components/ui/Modal'

interface TaskCreationModalProps {
  open: boolean
  onClose: () => void
  subgoalId?: ID // required in create mode
  milestoneId?: ID // create mode: present => under this milestone
  task?: Task // present => edit mode
}

const inputClass =
  'w-full rounded-app-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'

export function TaskCreationModal({
  open,
  onClose,
  subgoalId,
  milestoneId,
  task,
}: TaskCreationModalProps) {
  const isEdit = task !== undefined
  // isSaving lives in the wrapper (not the remounted form) so closing can be
  // blocked mid-save — backdrop, X and Escape all route through handleClose.
  const [isSaving, setIsSaving] = useState(false)

  function handleClose() {
    if (isSaving) return
    onClose()
  }

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title={isEdit ? 'Edit task' : 'Add a task'}
    >
      {open ? (
        <TaskForm
          subgoalId={subgoalId}
          milestoneId={milestoneId}
          task={task}
          isSaving={isSaving}
          setIsSaving={setIsSaving}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  )
}

interface TaskFormProps {
  subgoalId?: ID
  milestoneId?: ID
  task?: Task
  isSaving: boolean
  setIsSaving: (saving: boolean) => void
  onClose: () => void
}

function TaskForm({
  subgoalId,
  milestoneId,
  task,
  isSaving,
  setIsSaving,
  onClose,
}: TaskFormProps) {
  const addTask = useGoalStore((s) => s.addTask)
  const editTask = useGoalStore((s) => s.editTask)
  const currentGoalTree = useGoalStore((s) => s.currentGoalTree)
  const isEdit = task !== undefined

  const [title, setTitle] = useState(task?.title ?? '')
  const [priority, setPriority] = useState<Priority>(
    task?.priority ?? DEFAULT_TASK_PRIORITY,
  )
  const [effort, setEffort] = useState<EffortSize>(
    task?.effort ?? DEFAULT_TASK_EFFORT,
  )
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '')
  // scheduledDate is stored date-only (YYYY-MM-DD), which is exactly what an
  // <input type="date"> emits — no parsing/formatting needed. Setting it puts
  // the task on the Today list for that local calendar day.
  const [scheduledDate, setScheduledDate] = useState(task?.scheduledDate ?? '')
  const [isRecurring, setIsRecurring] = useState(task?.isRecurring ?? false)
  // Destination milestone for an edit (reassignment). '' = loose (no milestone).
  // Seeded from the task's current milestone; only ever sent on an edit.
  const [destMilestoneId, setDestMilestoneId] = useState<ID | ''>(
    task?.milestoneId ?? '',
  )
  const [description, setDescription] = useState(task?.description ?? '')

  // The milestones the task could move between = those under its own subgoal.
  // Only relevant when editing AND the subgoal actually has milestones; reading
  // them from the loaded tree keeps the modal a thin picker (no extra fetch).
  const milestoneOptions = useMemo(() => {
    if (!isEdit || !task) return []
    const sub = currentGoalTree?.subgoals.find(
      (s) => s.subgoal.id === task.subgoalId,
    )
    return sub
      ? sub.milestones.map((m) => ({ id: m.milestone.id, title: m.milestone.title }))
      : []
  }, [isEdit, task, currentGoalTree])
  const canReassign = isEdit && milestoneOptions.length > 0

  const canSave = title.trim().length > 0 && !isSaving

  function handleClose() {
    if (isSaving) return
    onClose()
  }

  async function handleSave() {
    if (!canSave) return
    setIsSaving(true)
    try {
      if (isEdit && task) {
        await editTask(task.id, {
          title: title.trim(),
          priority,
          effort,
          isRecurring,
          dueDate: dueDate || undefined,
          scheduledDate: scheduledDate || undefined,
          description: description.trim() || undefined,
          // Send the chosen milestone only when reassignment is offered; the store
          // recomputes the task's group-scoped order if it actually moved. '' means
          // "loose" (undefined milestoneId).
          ...(canReassign ? { milestoneId: destMilestoneId || undefined } : {}),
        })
      } else {
        await addTask({
          subgoalId: subgoalId ?? '',
          title: title.trim(),
          status: DEFAULT_TASK_STATUS,
          priority,
          effort,
          isRecurring,
          ...(milestoneId ? { milestoneId } : {}),
          ...(dueDate ? { dueDate } : {}),
          ...(scheduledDate ? { scheduledDate } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
        })
      }
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <div className="mt-5 space-y-4">
        <Field label="Title">
          <input
            autoFocus
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Solve 3 Leetcode graph questions"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Priority">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className={inputClass}
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Effort">
            <select
              value={effort}
              onChange={(e) => setEffort(e.target.value as EffortSize)}
              className={inputClass}
            >
              {EFFORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Reassign the task's milestone (edit only, and only when the subgoal has
            milestones to move between). "No milestone" makes it a loose task under
            the subgoal. */}
        {canReassign ? (
          <Field label="Milestone">
            <select
              value={destMilestoneId}
              onChange={(e) => setDestMilestoneId(e.target.value)}
              className={inputClass}
            >
              <option value="">No milestone (loose task)</option>
              {milestoneOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="Due date (optional)">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Scheduled for (optional)">
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-app-text-muted">
            Adds this task to your Today list on that day.
          </span>
        </Field>

        {/* Recurring: a task that comes back regularly (e.g. a weekly review).
            For now this is a plain flag shown as a badge on the task row; the
            scheduler that acts on it lands in a later phase. */}
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="mt-0.5 shrink-0 accent-app-text"
          />
          <span>
            <span className="block text-sm font-medium text-app-text">
              Recurring task
            </span>
            <span className="mt-0.5 block text-xs text-app-text-muted">
              Something you repeat regularly, not a one-off.
            </span>
          </span>
        </label>

        <Field label="Description (optional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Any detail worth remembering"
            className={`${inputClass} resize-none`}
          />
        </Field>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={handleClose}
          className="rounded-app-lg border border-app-border px-4 py-2 text-sm font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        >
          {isSaving ? 'Saving...' : isEdit ? 'Save changes' : 'Add task'}
        </button>
      </div>
    </>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-app-text">
        {label}
      </span>
      {children}
    </label>
  )
}
