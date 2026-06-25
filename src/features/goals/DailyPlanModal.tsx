// DailyPlanModal — preview / accept an AI-generated daily plan for a consistency
// subgoal (Phase 5).
//
// On open it asks the store for a short dated plan (store.generateDailyPlan ->
// AIProvider -> shared parser -> pure scheduler), shows each session with its
// scheduled day, and lets the user edit titles and uncheck days they don't want.
// Accepted sessions are written through the EXISTING addTask path as loose,
// scheduled tasks (scheduledDate + estimatedMinutes, no milestone). Pure
// presentation + local state; never imports a provider, the engine, or a repo.
//
// One modal per entity is the established convention, so this is its own
// component, parallel to the milestone/subgoal suggestion modals.

import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { DEFAULT_TASK_STATUS, DEFAULT_TASK_PRIORITY } from '@/core/constants'
import { useGoalStore } from '@/store/useGoalStore'
import type { DailyPlanRequest } from '@/engine/ai/types'
import { Modal } from '@/components/ui/Modal'

interface DailyPlanModalProps {
  open: boolean
  onClose: () => void
  // Carries subgoalId + everything generateDailyPlan needs; the store derives the
  // dated window (start + length) from the subgoal's existing tasks.
  request: DailyPlanRequest
}

type Phase = 'loading' | 'error' | 'ready'

// One scheduled session as the user reviews it. scheduledDate + estimatedMinutes
// come from the engine and are fixed (the day is the point of a daily plan);
// title is editable, include is the accept/reject toggle.
interface DraftDay {
  include: boolean
  title: string
  description?: string
  scheduledDate: string
  estimatedMinutes: number
}

const inputClass =
  'w-full rounded-app-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'

export function DailyPlanModal({
  open,
  onClose,
  request,
}: DailyPlanModalProps) {
  const generateDailyPlan = useGoalStore((s) => s.generateDailyPlan)
  const addTask = useGoalStore((s) => s.addTask)

  const [phase, setPhase] = useState<Phase>('loading')
  const [drafts, setDrafts] = useState<DraftDay[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!open) return
    let active = true
    setPhase('loading')
    setSaveFailed(false)
    generateDailyPlan(request)
      .then((plan) => {
        if (!active) return
        setDrafts(
          plan.map((t) => ({
            include: true,
            title: t.title,
            description: t.description,
            scheduledDate: t.scheduledDate,
            estimatedMinutes: t.estimatedMinutes,
          })),
        )
        setPhase('ready')
      })
      .catch(() => {
        if (active) setPhase('error')
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reloadKey])

  const update = (index: number, patch: Partial<DraftDay>) =>
    setDrafts((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    )

  const chosen = drafts.filter((d) => d.include && d.title.trim().length > 0)
  const canSave = chosen.length > 0 && !isSaving

  function handleClose() {
    if (isSaving) return
    onClose()
  }

  async function handleSave() {
    if (!canSave) return
    setIsSaving(true)
    setSaveFailed(false)
    try {
      // Sequential, not parallel: addTask derives each task's order from
      // max(siblings)+1, so the writes must not race. Each session becomes a
      // loose, scheduled task under the subgoal (no milestone).
      for (const d of chosen) {
        await addTask({
          subgoalId: request.subgoalId,
          title: d.title.trim(),
          status: DEFAULT_TASK_STATUS,
          priority: DEFAULT_TASK_PRIORITY,
          isRecurring: false,
          scheduledDate: d.scheduledDate,
          estimatedMinutes: d.estimatedMinutes,
          ...(d.description ? { description: d.description } : {}),
        })
      }
      onClose()
    } catch {
      setSaveFailed(true)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={open} onClose={handleClose} title="Daily plan">
      {phase === 'loading' ? (
        <p className="mt-6 mb-2 animate-pulse text-sm text-app-text-muted">
          Building a daily plan for this subgoal...
        </p>
      ) : null}

      {phase === 'error' ? (
        <div className="mt-5">
          <p className="text-sm text-app-text-muted">
            Could not build a plan just now. You can try again or add tasks
            yourself.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={handleClose} className={secondaryBtn}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className={primaryBtn}
            >
              Try again
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'ready' && drafts.length === 0 ? (
        <div className="mt-5">
          <p className="text-sm text-app-text-muted">
            No plan this time. You can add daily tasks yourself.
          </p>
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={handleClose} className={secondaryBtn}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'ready' && drafts.length > 0 ? (
        <div className="mt-5">
          <p className="mb-3 text-sm text-app-text-muted">
            Edit or uncheck any day, then add the ones you want.
          </p>

          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {drafts.map((draft, index) => (
              <div
                key={index}
                className="flex items-center gap-3 rounded-app-lg border border-app-border p-3"
              >
                <input
                  type="checkbox"
                  checked={draft.include}
                  onChange={(e) => update(index, { include: e.target.checked })}
                  aria-label={`Include ${draft.title || 'this day'}`}
                  className="shrink-0 accent-app-text"
                />
                <span
                  className={`w-20 shrink-0 text-xs text-app-text-muted ${draft.include ? '' : 'opacity-50'}`}
                >
                  {format(parseISO(draft.scheduledDate), 'EEE d MMM')}
                </span>
                <input
                  type="text"
                  value={draft.title}
                  onChange={(e) => update(index, { title: e.target.value })}
                  placeholder="Session"
                  className={`${inputClass} ${draft.include ? '' : 'opacity-50'}`}
                />
              </div>
            ))}
          </div>

          {saveFailed ? (
            <p className="mt-3 text-sm text-red-600">
              Something went wrong adding the tasks. Please try again.
            </p>
          ) : null}

          <div className="mt-6 flex items-center justify-between gap-3">
            <span className="text-xs text-app-text-muted">
              {chosen.length} selected
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className={secondaryBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className={`${primaryBtn} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {isSaving
                  ? 'Adding...'
                  : `Add ${chosen.length} task${chosen.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}

const secondaryBtn =
  'rounded-app-lg border border-app-border px-4 py-2 text-sm font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'
const primaryBtn =
  'rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'
