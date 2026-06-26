// AddToPlanModal — choose which goal an accepted opportunity attaches to, then
// materialise it into the plan. Thin by design: the store action addToPlan owns
// WHAT gets created (a subgoal carrying the deadline + a starter "Apply" task);
// this modal only collects the goal choice and confirms.
//
// The goal <select> defaults to the opportunity's strongest matched goal (so the
// common case is one click), but lets the user file it anywhere — which also
// covers opportunities that matched no goal at all.

import { useEffect, useMemo, useState } from 'react'
import type { ID, Opportunity } from '@/core/types'
import { useGoalStore } from '@/store/useGoalStore'
import { useDiscoveryStore } from '@/store/useDiscoveryStore'
import { Modal } from '@/components/ui/Modal'

interface AddToPlanModalProps {
  open: boolean
  onClose: () => void
  opportunity: Opportunity
}

const inputClass =
  'w-full rounded-app-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'

export function AddToPlanModal({ open, onClose, opportunity }: AddToPlanModalProps) {
  const goals = useGoalStore((s) => s.goals)
  const addToPlan = useDiscoveryStore((s) => s.addToPlan)

  const [goalId, setGoalId] = useState<ID>('')
  const [isSaving, setIsSaving] = useState(false)

  // The strongest matched goal that still exists, else the first goal — the
  // sensible default selection.
  const defaultGoalId = useMemo(() => {
    const matched = opportunity.matchedGoalIds.find((id) =>
      goals.some((g) => g.id === id),
    )
    return matched ?? goals[0]?.id ?? ''
  }, [opportunity.matchedGoalIds, goals])

  // Re-seed the selection each time the modal opens, keyed on `open` so an
  // in-progress pick is never clobbered by an unrelated re-render.
  useEffect(() => {
    if (!open) return
    setGoalId(defaultGoalId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const hasGoals = goals.length > 0
  const canSave = hasGoals && goalId.length > 0 && !isSaving

  function handleClose() {
    if (isSaving) return
    onClose()
  }

  async function handleSave() {
    if (!canSave) return
    setIsSaving(true)
    try {
      await addToPlan(opportunity, goalId)
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={open} onClose={handleClose} title="Add to plan">
      {hasGoals ? (
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-app-text">
              Add under goal
            </span>
            <select
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              className={inputClass}
            >
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
          </label>

          {/* What will be created, in plain words, so the action is no surprise. */}
          <div className="rounded-app-lg border border-app-border bg-app-surface-alt p-3 text-sm text-app-text-muted">
            Creates a subgoal{' '}
            <span className="font-medium text-app-text">{opportunity.title}</span>{' '}
            with an <span className="font-medium text-app-text">Apply</span> task.
            {opportunity.deadline ? (
              <>
                {' '}
                Its target date is set to {opportunity.deadline}.
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-5 text-sm text-app-text-muted">
          You need a goal first. Create one, then come back to add this opportunity
          under it.
        </p>
      )}

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
          {isSaving ? 'Adding...' : 'Add to plan'}
        </button>
      </div>
    </Modal>
  )
}
