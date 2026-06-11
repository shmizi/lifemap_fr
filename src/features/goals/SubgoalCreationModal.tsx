// SubgoalCreationModal — the form for adding a subgoal to a goal.
//
// Self-contained (overlay + panel + form), mirroring GoalCreationModal. This is
// the second modal in the app; once milestone/task modals also exist, the shared
// shell will be extracted into components/ui/Modal in one refactor. Until then,
// keeping this consistent with the existing modal is the lower-risk choice.
//
// Form state is plain local React state. The write is delegated to the store's
// addSubgoal action — the component never touches the database or computes the
// subgoal's order itself.

import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ID } from '@/core/types'
import { DEFAULT_SUBGOAL_STATUS } from '@/core/constants'
import { useGoalStore, type NewSubgoalInput } from '@/store/useGoalStore'

interface SubgoalCreationModalProps {
  goalId: ID
  open: boolean
  onClose: () => void
}

const inputClass =
  'w-full rounded-app-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'

export function SubgoalCreationModal({
  goalId,
  open,
  onClose,
}: SubgoalCreationModalProps) {
  const addSubgoal = useGoalStore((s) => s.addSubgoal)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const canSave = title.trim().length > 0 && !isSaving

  function reset() {
    setTitle('')
    setDescription('')
    setTargetDate('')
  }

  function handleClose() {
    if (isSaving) return
    reset()
    onClose()
  }

  async function handleSave() {
    if (!canSave) return
    setIsSaving(true)
    try {
      // Build the input; only include targetDate when one was entered, so we
      // never write an explicit `undefined` (keeps strict optional types happy).
      const input: NewSubgoalInput = {
        goalId,
        title: title.trim(),
        description: description.trim(),
        status: DEFAULT_SUBGOAL_STATUS,
        requiresConsistency: false,
        ...(targetDate ? { targetDate } : {}),
      }
      await addSubgoal(input)
      reset()
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
            aria-label="Add a subgoal"
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
                Add a subgoal
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
                {isSaving ? 'Saving...' : 'Add subgoal'}
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