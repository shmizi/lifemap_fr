// GoalCreationModal — create OR edit a goal.
//
// Despite the historical name, this modal handles both: pass a `goal` to edit it,
// omit it to create a new one. The overlay/panel shell lives in the shared
// <Modal> component; the form body lives in <GoalForm>, mounted fresh each time
// the modal opens so its fields seed straight from props via useState
// initializers — no set-state-in-effect re-seed step. Form state is local; writes
// go through the store's addGoal / editGoal actions — the component never touches
// the database.

import { useState, type ReactNode } from 'react'
import type { Goal, GoalCategory } from '@/core/types'
import {
  GOAL_CATEGORY_OPTIONS,
  DEFAULT_GOAL_STATUS,
  DEFAULT_GOAL_PRIORITY,
} from '@/core/constants'
import { useGoalStore } from '@/store/useGoalStore'
import { Modal } from '@/components/ui/Modal'

interface GoalCreationModalProps {
  open: boolean
  onClose: () => void
  goal?: Goal // present => edit mode
}

const inputClass =
  'w-full rounded-app-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'

export function GoalCreationModal({ open, onClose, goal }: GoalCreationModalProps) {
  const isEdit = goal !== undefined
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
      title={isEdit ? 'Edit goal' : 'Create a goal'}
    >
      {/* Mounted only while open, so each open is a fresh mount whose useState
          initializers seed from `goal` (edit) or empty (create). */}
      {open ? (
        <GoalForm
          goal={goal}
          isSaving={isSaving}
          setIsSaving={setIsSaving}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  )
}

interface GoalFormProps {
  goal?: Goal
  isSaving: boolean
  setIsSaving: (saving: boolean) => void
  onClose: () => void
}

function GoalForm({ goal, isSaving, setIsSaving, onClose }: GoalFormProps) {
  const addGoal = useGoalStore((s) => s.addGoal)
  const editGoal = useGoalStore((s) => s.editGoal)
  const isEdit = goal !== undefined

  const [title, setTitle] = useState(goal?.title ?? '')
  const [category, setCategory] = useState<GoalCategory>(
    goal?.category ?? GOAL_CATEGORY_OPTIONS[0].value,
  )
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '')
  const [description, setDescription] = useState(goal?.description ?? '')

  const canSave = title.trim().length > 0 && targetDate.length > 0 && !isSaving

  function handleClose() {
    if (isSaving) return
    onClose()
  }

  async function handleSave() {
    if (!canSave) return
    setIsSaving(true)
    try {
      if (isEdit && goal) {
        await editGoal(goal.id, {
          title: title.trim(),
          description: description.trim(),
          category,
          targetDate,
        })
      } else {
        await addGoal({
          title: title.trim(),
          description: description.trim(),
          category,
          targetDate,
          status: DEFAULT_GOAL_STATUS,
          priority: DEFAULT_GOAL_PRIORITY,
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
            placeholder="e.g. Get into RWTH Aachen"
            className={inputClass}
          />
        </Field>

        <Field label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as GoalCategory)}
            className={inputClass}
          >
            {GOAL_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Target date">
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What does reaching this goal look like?"
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
          {isSaving ? 'Saving...' : isEdit ? 'Save changes' : 'Create goal'}
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
