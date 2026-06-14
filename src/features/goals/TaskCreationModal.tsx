// TaskCreationModal — create OR edit a task.
//
// Pass `task` to edit it. To create: pass subgoalId (always) and milestoneId
// (only when the task sits under a specific milestone; omit for a loose task).
// The overlay/panel shell now lives in the shared <Modal> component. Writes go
// through addTask / editTask (the store owns order). Edit patches only
// title/priority/dueDate/description — status, completedAt, etc. are preserved.

import { useEffect, useState, type ReactNode } from 'react'
import type { ID, Priority, Task } from '@/core/types'
import {
  DEFAULT_TASK_STATUS,
  DEFAULT_TASK_PRIORITY,
  PRIORITY_OPTIONS,
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
  const addTask = useGoalStore((s) => s.addTask)
  const editTask = useGoalStore((s) => s.editTask)
  const isEdit = task !== undefined

  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Priority>(DEFAULT_TASK_PRIORITY)
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(task?.title ?? '')
    setPriority(task?.priority ?? DEFAULT_TASK_PRIORITY)
    setDueDate(task?.dueDate ?? '')
    setDescription(task?.description ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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
          dueDate: dueDate || undefined,
          description: description.trim() || undefined,
        })
      } else {
        await addTask({
          subgoalId: subgoalId ?? '',
          title: title.trim(),
          status: DEFAULT_TASK_STATUS,
          priority,
          isRecurring: false,
          ...(milestoneId ? { milestoneId } : {}),
          ...(dueDate ? { dueDate } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
        })
      }
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title={isEdit ? 'Edit task' : 'Add a task'}
    >
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

          <Field label="Due date (optional)">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

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
    </Modal>
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