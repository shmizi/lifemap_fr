// MilestoneCreationModal — create OR edit a milestone.
//
// Pass `milestone` to edit it; pass `subgoalId` to create a new one under that
// subgoal. The Milestone type has no due-date field, so the form is title +
// description. Writes go through addMilestone / editMilestone (store owns order).

import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ID, Milestone } from '@/core/types'
import { DEFAULT_MILESTONE_STATUS } from '@/core/constants'
import { useGoalStore } from '@/store/useGoalStore'

interface MilestoneCreationModalProps {
  open: boolean
  onClose: () => void
  subgoalId?: ID // required in create mode
  milestone?: Milestone // present => edit mode
}

const inputClass =
  'w-full rounded-app-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'

export function MilestoneCreationModal({
  open,
  onClose,
  subgoalId,
  milestone,
}: MilestoneCreationModalProps) {
  const addMilestone = useGoalStore((s) => s.addMilestone)
  const editMilestone = useGoalStore((s) => s.editMilestone)
  const isEdit = milestone !== undefined

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(milestone?.title ?? '')
    setDescription(milestone?.description ?? '')
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
      if (isEdit && milestone) {
        await editMilestone(milestone.id, {
          title: title.trim(),
          description: description.trim() || undefined,
        })
      } else {
        await addMilestone({
          subgoalId: subgoalId ?? '',
          title: title.trim(),
          status: DEFAULT_MILESTONE_STATUS,
          aiSuggested: false,
          ...(description.trim() ? { description: description.trim() } : {}),
        })
      }
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={isEdit ? 'Edit milestone' : 'Add a milestone'}
            className="relative w-full max-w-lg rounded-app-lg border border-app-border bg-app-surface p-6 shadow-xl"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18 }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') handleClose()
            }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-app-text">
                {isEdit ? 'Edit milestone' : 'Add a milestone'}
              </h2>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="rounded-md p-1 text-app-text-muted transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <Field label="Title">
                <input
                  autoFocus
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Pass Goethe B1"
                  className={inputClass}
                />
              </Field>

              <Field label="Description (optional)">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="What marks this checkpoint as done?"
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
                {isSaving ? 'Saving...' : isEdit ? 'Save changes' : 'Add milestone'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
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