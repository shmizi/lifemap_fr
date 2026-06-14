// SubgoalCreationModal — create OR edit a subgoal.
//
// Pass `subgoal` to edit it; pass `goalId` to create a new one under that goal.
// The overlay/panel shell now lives in the shared <Modal> component; this file
// keeps only the form. Writes go through the store's addSubgoal / editSubgoal
// actions (the store owns `order`).

import { useEffect, useState, type ReactNode } from 'react'
import type { ID, Subgoal } from '@/core/types'
import { DEFAULT_SUBGOAL_STATUS } from '@/core/constants'
import { useGoalStore } from '@/store/useGoalStore'
import { Modal } from '@/components/ui/Modal'

interface SubgoalCreationModalProps {
  open: boolean
  onClose: () => void
  goalId?: ID // required in create mode
  subgoal?: Subgoal // present => edit mode
}

const inputClass =
  'w-full rounded-app-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'

export function SubgoalCreationModal({
  open,
  onClose,
  goalId,
  subgoal,
}: SubgoalCreationModalProps) {
  const addSubgoal = useGoalStore((s) => s.addSubgoal)
  const editSubgoal = useGoalStore((s) => s.editSubgoal)
  const isEdit = subgoal !== undefined

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(subgoal?.title ?? '')
    setDescription(subgoal?.description ?? '')
    setTargetDate(subgoal?.targetDate ?? '')
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
      if (isEdit && subgoal) {
        // Edit patches only these fields; status / requiresConsistency / order
        // are left untouched. targetDate || undefined lets a cleared date persist.
        await editSubgoal(subgoal.id, {
          title: title.trim(),
          description: description.trim(),
          targetDate: targetDate || undefined,
        })
      } else {
        await addSubgoal({
          goalId: goalId ?? '',
          title: title.trim(),
          description: description.trim(),
          status: DEFAULT_SUBGOAL_STATUS,
          requiresConsistency: false,
          ...(targetDate ? { targetDate } : {}),
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
      title={isEdit ? 'Edit subgoal' : 'Add a subgoal'}
    >
      <div className="mt-5 space-y-4">
        <Field label="Title">
          <input
            autoFocus
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. German B2"
            className={inputClass}
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What does this part of the goal involve?"
            className={`${inputClass} resize-none`}
          />
        </Field>

        <Field label="Target date (optional)">
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className={inputClass}
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
          {isSaving ? 'Saving...' : isEdit ? 'Save changes' : 'Add subgoal'}
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