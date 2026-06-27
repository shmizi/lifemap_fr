// AddToPlanModal — choose which goal an accepted opportunity attaches to, then
// materialise it into the plan. Thin by design: the store action addToPlan owns
// WHAT gets created (a subgoal carrying the deadline + a starter "Apply" task);
// this modal only collects the goal choice and confirms.
//
// The goal <select> defaults to the opportunity's strongest matched goal (so the
// common case is one click), but lets the user file it anywhere — which also
// covers opportunities that matched no goal at all. The body lives in <PlanForm>,
// mounted fresh each open so the selection seeds from props via a useState
// initializer (no set-state-in-effect re-seed).

import { useState } from 'react'
import type { Goal, ID, Opportunity } from '@/core/types'
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

// The strongest matched goal that still exists, else the first goal — the
// sensible default selection (works for 0 / 1 / many matched goals).
function pickDefaultGoalId(opportunity: Opportunity, goals: Goal[]): ID {
  const matched = opportunity.matchedGoalIds.find((id) =>
    goals.some((g) => g.id === id),
  )
  return matched ?? goals[0]?.id ?? ''
}

export function AddToPlanModal({ open, onClose, opportunity }: AddToPlanModalProps) {
  // isSaving lives in the wrapper (not the remounted form) so closing can be
  // blocked mid-save — backdrop, X and Escape all route through handleClose.
  const [isSaving, setIsSaving] = useState(false)

  function handleClose() {
    if (isSaving) return
    onClose()
  }

  return (
    <Modal isOpen={open} onClose={handleClose} title="Add to plan">
      {open ? (
        <PlanForm
          opportunity={opportunity}
          isSaving={isSaving}
          setIsSaving={setIsSaving}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  )
}

interface PlanFormProps {
  opportunity: Opportunity
  isSaving: boolean
  setIsSaving: (saving: boolean) => void
  onClose: () => void
}

function PlanForm({ opportunity, isSaving, setIsSaving, onClose }: PlanFormProps) {
  const goals = useGoalStore((s) => s.goals)
  const addToPlan = useDiscoveryStore((s) => s.addToPlan)

  // Seed the selection once on mount from the strongest matched goal.
  const [goalId, setGoalId] = useState<ID>(() =>
    pickDefaultGoalId(opportunity, goals),
  )

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
    <>
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
    </>
  )
}
