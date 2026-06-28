// GoalCreationModal — create OR edit a goal, plus its AI-tailoring intake.
//
// Despite the historical name, this modal handles both: pass a `goal` to edit it,
// omit it to create a new one. The overlay/panel shell lives in the shared
// <Modal> component; the form body lives in <GoalForm>, mounted fresh each time
// the modal opens so its fields seed straight from props via useState
// initializers — no set-state-in-effect re-seed. Form state is local; writes
// go through the store's addGoal / editGoal actions — the component never touches
// the database.
//
// Phase 9: the form also captures per-goal intake (GoalContext) — where the user
// is starting from, whether the deadline is hard, why it matters — which is what
// lets two people with the SAME goal get DIFFERENT roadmaps. In edit mode the
// existing context is fetched BEFORE the form mounts (via GoalFormLoader), so the
// intake fields seed from it the same prop-driven way the goal fields do. The goal
// and its context are written together on save.

import { useEffect, useState, type ReactNode } from 'react'
import type {
  Goal,
  GoalCategory,
  GoalContext,
  DeadlineHardness,
} from '@/core/types'
import {
  GOAL_CATEGORY_OPTIONS,
  DEFAULT_GOAL_STATUS,
  DEFAULT_GOAL_PRIORITY,
  DEADLINE_HARDNESS_OPTIONS,
  DEFAULT_DEADLINE_HARDNESS,
} from '@/core/constants'
import { useGoalStore } from '@/store/useGoalStore'
import { useContextStore } from '@/store/useContextStore'
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
      {/* Mounted only while open, so each open is a fresh mount. In edit mode it
          first fetches the goal's intake context, then mounts GoalForm so its
          useState initializers seed from both the goal and its context. */}
      {open ? (
        <GoalFormLoader
          goal={goal}
          isSaving={isSaving}
          setIsSaving={setIsSaving}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  )
}

interface GoalFormLoaderProps {
  goal?: Goal
  isSaving: boolean
  setIsSaving: (saving: boolean) => void
  onClose: () => void
}

// In edit mode, fetch the goal's existing intake context once on mount, then
// render the form with it as a prop (the form seeds from props, not effects). In
// create mode there is nothing to load, so the form mounts immediately.
function GoalFormLoader({
  goal,
  isSaving,
  setIsSaving,
  onClose,
}: GoalFormLoaderProps) {
  const isEdit = goal !== undefined
  const fetchGoalContext = useContextStore((s) => s.fetchGoalContext)
  const [loaded, setLoaded] = useState(!isEdit)
  const [goalContext, setGoalContext] = useState<GoalContext | undefined>(
    undefined,
  )

  useEffect(() => {
    if (!isEdit || !goal) return
    let active = true
    void fetchGoalContext(goal.id).then((ctx) => {
      if (!active) return
      setGoalContext(ctx)
      setLoaded(true)
    })
    return () => {
      active = false
    }
  }, [isEdit, goal, fetchGoalContext])

  if (!loaded) {
    return (
      <p className="mt-5 animate-pulse text-sm text-app-text-muted">Loading...</p>
    )
  }

  return (
    <GoalForm
      goal={goal}
      goalContext={goalContext}
      isSaving={isSaving}
      setIsSaving={setIsSaving}
      onClose={onClose}
    />
  )
}

interface GoalFormProps {
  goal?: Goal
  goalContext?: GoalContext
  isSaving: boolean
  setIsSaving: (saving: boolean) => void
  onClose: () => void
}

function GoalForm({
  goal,
  goalContext,
  isSaving,
  setIsSaving,
  onClose,
}: GoalFormProps) {
  const addGoal = useGoalStore((s) => s.addGoal)
  const editGoal = useGoalStore((s) => s.editGoal)
  const saveGoalContext = useContextStore((s) => s.saveGoalContext)
  const isEdit = goal !== undefined

  const [title, setTitle] = useState(goal?.title ?? '')
  const [category, setCategory] = useState<GoalCategory>(
    goal?.category ?? GOAL_CATEGORY_OPTIONS[0].value,
  )
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '')
  const [description, setDescription] = useState(goal?.description ?? '')

  // Per-goal intake (GoalContext) — seeded from the fetched context in edit mode.
  const [deadlineHardness, setDeadlineHardness] = useState<DeadlineHardness>(
    goalContext?.deadlineHardness ?? DEFAULT_DEADLINE_HARDNESS,
  )
  const [startingLevel, setStartingLevel] = useState(
    goalContext?.startingLevel ?? '',
  )
  const [priorExperience, setPriorExperience] = useState(
    goalContext?.priorExperience ?? '',
  )
  const [motivation, setMotivation] = useState(goalContext?.motivation ?? '')

  const canSave = title.trim().length > 0 && targetDate.length > 0 && !isSaving

  function handleClose() {
    if (isSaving) return
    onClose()
  }

  async function handleSave() {
    if (!canSave) return
    setIsSaving(true)
    try {
      // Create or update the goal, then persist its intake context against the
      // goal's id. A new goal gives us its id back; an edit already has one.
      let goalId: string
      if (isEdit && goal) {
        await editGoal(goal.id, {
          title: title.trim(),
          description: description.trim(),
          category,
          targetDate,
        })
        goalId = goal.id
      } else {
        const created = await addGoal({
          title: title.trim(),
          description: description.trim(),
          category,
          targetDate,
          status: DEFAULT_GOAL_STATUS,
          priority: DEFAULT_GOAL_PRIORITY,
        })
        goalId = created.id
      }

      await saveGoalContext({
        goalId,
        deadlineHardness,
        startingLevel: startingLevel.trim() || undefined,
        priorExperience: priorExperience.trim() || undefined,
        motivation: motivation.trim() || undefined,
      })
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

      {/* Tailoring intake — what makes the roadmap fit YOU. All optional except
          the deadline type, which defaults to a flexible target. */}
      <div className="mt-6 border-t border-app-border pt-5">
        <h3 className="text-sm font-semibold text-app-text">
          Tailor this goal to you
        </h3>
        <p className="mt-1 text-sm text-app-text-muted">
          Helps the AI shape a roadmap around where you actually are.
        </p>

        <div className="mt-4 space-y-4">
          <Field label="Deadline type">
            <select
              value={deadlineHardness}
              onChange={(e) =>
                setDeadlineHardness(e.target.value as DeadlineHardness)
              }
              className={inputClass}
            >
              {DEADLINE_HARDNESS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Where are you starting from? (optional)">
            <input
              type="text"
              value={startingLevel}
              onChange={(e) => setStartingLevel(e.target.value)}
              placeholder="e.g. complete beginner / German A2 / can solve easy DSA"
              className={inputClass}
            />
          </Field>

          <Field label="What have you already done toward it? (optional)">
            <textarea
              value={priorExperience}
              onChange={(e) => setPriorExperience(e.target.value)}
              rows={2}
              placeholder="Courses, projects, attempts so far..."
              className={`${inputClass} resize-none`}
            />
          </Field>

          <Field label="Why does this matter to you? (optional)">
            <input
              type="text"
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              placeholder="What reaching it would change"
              className={inputClass}
            />
          </Field>
        </div>
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
