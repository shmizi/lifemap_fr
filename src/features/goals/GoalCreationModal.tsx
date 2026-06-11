// GoalCreationModal — the form for creating a new goal.
//
// WHY this is one self-contained component (overlay + panel + form) rather than
// a shared <Modal>: it is the first and only modal in the app so far. Extracting
// a generic Modal now would be a premature abstraction. When a second modal
// appears (subgoal / milestone / task creation), THEN extract the shared shell.
// TODO(Phase 1+): extract components/ui/Modal once a second modal exists.
//
// It owns its own form state with plain React state (transient UI state belongs
// in the component, not the store) and delegates the actual write to the store's
// addGoal action — the component never touches the database directly.

import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { GoalCategory } from '@/core/types'
import {
  GOAL_CATEGORY_OPTIONS,
  DEFAULT_GOAL_STATUS,
  DEFAULT_GOAL_PRIORITY,
} from '@/core/constants'
import { useGoalStore } from '@/store/useGoalStore'

interface GoalCreationModalProps {
  open: boolean
  onClose: () => void
}

const inputClass =
  'w-full rounded-app-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'

export function GoalCreationModal({ open, onClose }: GoalCreationModalProps) {
  const addGoal = useGoalStore((s) => s.addGoal)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<GoalCategory>(
    GOAL_CATEGORY_OPTIONS[0].value,
  )
  const [targetDate, setTargetDate] = useState('')
  const [description, setDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const canSave =
    title.trim().length > 0 && targetDate.length > 0 && !isSaving

  // Reset to the empty state. Called after a successful save and on dismiss, so
  // reopening never shows stale input.
  function reset() {
    setTitle('')
    setCategory(GOAL_CATEGORY_OPTIONS[0].value)
    setTargetDate('')
    setDescription('')
  }

  function handleClose() {
    if (isSaving) return // don't let a dismiss interrupt an in-flight write
    reset()
    onClose()
  }

  async function handleSave() {
    if (!canSave) return
    setIsSaving(true)
    try {
      await addGoal({
        title: title.trim(),
        description: description.trim(),
        category,
        targetDate,
        status: DEFAULT_GOAL_STATUS,
        priority: DEFAULT_GOAL_PRIORITY,
      })
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
          {/* Backdrop — click to dismiss */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Panel. onKeyDown handles Escape while focus is inside the dialog
              (the title input autofocuses on open, so focus starts here). */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Create a goal"
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
                Create a goal
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
                {isSaving ? 'Saving...' : 'Create goal'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

// Local label+control wrapper (not exported): only useful inside this form, so
// extracting it would be premature.
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
