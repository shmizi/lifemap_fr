// PhaseTasksReviewModal — the review / edit / accept step for the AI-proposed dated
// TASKS of a single phase (Phase 10, Stage 3). The phase-schedule step used to write
// tasks straight to the database; this puts a human gate in front of it, matching the
// suggestion features' accept flow.
//
// On open it asks the store for a PROPOSAL only (store.generatePhaseTasksProposal ->
// the daily-plan pipeline, no write), lets the user rename or drop individual tasks,
// then writes the kept set via store.applyPhaseTasks (the existing addTask path, under
// this milestone). Nothing lands until Accept. The task DATES and durations are the
// scheduler's job and shown read-only; the user edits titles and inclusion only —
// re-running to reshape the schedule is a separate, cheaper affordance.
//
// Same wrapper/body shape as the other review modals: the body remounts on open and on
// Retry (mount-time fetch), and isSaving lives in the wrapper to block a mid-write close.

import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Repeat } from 'lucide-react'
import type { ID } from '@/core/types'
import type { ScheduledDailyTask } from '@/engine/ai/types'
import { useGoalStore } from '@/store/useGoalStore'
import { Modal } from '@/components/ui/Modal'

interface PhaseTasksReviewModalProps {
  open: boolean
  onClose: () => void
  milestoneId: ID
  // The phase title, for the modal's intro line.
  milestoneTitle: string
}

type Phase = 'loading' | 'error' | 'ready'

interface DraftTask {
  include: boolean
  title: string
  // The scheduler's output, kept intact so date/minutes/recurrence survive to the write.
  task: ScheduledDailyTask
}

const inputClass =
  'w-full rounded-app-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'
const secondaryBtn =
  'rounded-app-lg border border-app-border px-4 py-2 text-sm font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'
const primaryBtn =
  'rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'

function formatDate(iso: string): string {
  try {
    return format(parseISO(iso), 'EEE d MMM')
  } catch {
    return iso
  }
}

export function PhaseTasksReviewModal({
  open,
  onClose,
  milestoneId,
  milestoneTitle,
}: PhaseTasksReviewModalProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [attempt, setAttempt] = useState(0)

  function handleClose() {
    if (isSaving) return
    onClose()
  }

  return (
    <Modal isOpen={open} onClose={handleClose} title="Review the phase plan">
      {open ? (
        <PhaseTasksReviewBody
          key={attempt}
          milestoneId={milestoneId}
          milestoneTitle={milestoneTitle}
          isSaving={isSaving}
          setIsSaving={setIsSaving}
          onRetry={() => setAttempt((a) => a + 1)}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  )
}

interface BodyProps {
  milestoneId: ID
  milestoneTitle: string
  isSaving: boolean
  setIsSaving: (saving: boolean) => void
  onRetry: () => void
  onClose: () => void
}

function PhaseTasksReviewBody({
  milestoneId,
  milestoneTitle,
  isSaving,
  setIsSaving,
  onRetry,
  onClose,
}: BodyProps) {
  const generatePhaseTasksProposal = useGoalStore(
    (s) => s.generatePhaseTasksProposal,
  )
  const applyPhaseTasks = useGoalStore((s) => s.applyPhaseTasks)

  const [phase, setPhase] = useState<Phase>('loading')
  const [drafts, setDrafts] = useState<DraftTask[]>([])
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    let active = true
    generatePhaseTasksProposal(milestoneId)
      .then((tasks) => {
        if (!active) return
        setDrafts(tasks.map((t) => ({ include: true, title: t.title, task: t })))
        setPhase('ready')
      })
      .catch(() => {
        if (active) setPhase('error')
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const update = (index: number, patch: Partial<DraftTask>) =>
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))

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
      const kept: ScheduledDailyTask[] = chosen.map((d) => ({
        ...d.task,
        title: d.title.trim(),
      }))
      await applyPhaseTasks(milestoneId, kept)
      onClose()
    } catch {
      setSaveFailed(true)
    } finally {
      setIsSaving(false)
    }
  }

  if (phase === 'loading') {
    return (
      <p className="mt-6 mb-2 animate-pulse text-sm text-app-text-muted">
        Drafting a couple of weeks of tasks for this phase…
      </p>
    )
  }

  if (phase === 'error') {
    return (
      <div className="mt-5">
        <p className="text-sm text-app-text-muted">
          Could not plan this phase just now. You can try again or add tasks
          yourself.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={handleClose} className={secondaryBtn}>
            Cancel
          </button>
          <button type="button" onClick={onRetry} className={primaryBtn}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (drafts.length === 0) {
    return (
      <div className="mt-5">
        <p className="text-sm text-app-text-muted">
          Nothing to plan here — this phase already reaches its deadline, or no tasks
          came back. You can add tasks yourself.
        </p>
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={handleClose} className={secondaryBtn}>
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-5">
      <p className="mb-3 text-sm text-app-text-muted">
        Tasks for <span className="font-medium text-app-text">{milestoneTitle}</span>.
        Rename or drop any, then accept — the dates are set to fit your days.
      </p>

      <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
        {drafts.map((draft, index) => (
          <div
            key={index}
            className="flex items-start gap-3 rounded-app-lg border border-app-border p-3"
          >
            <input
              type="checkbox"
              checked={draft.include}
              onChange={(e) => update(index, { include: e.target.checked })}
              aria-label={`Include ${draft.title || 'this task'}`}
              className="mt-2 shrink-0 accent-app-text"
            />
            <div className={`flex-1 space-y-1 ${draft.include ? '' : 'opacity-50'}`}>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => update(index, { title: e.target.value })}
                placeholder="Task title"
                className={inputClass}
              />
              <div className="flex flex-wrap items-center gap-2 text-xs text-app-text-muted">
                <span>{formatDate(draft.task.scheduledDate)}</span>
                <span aria-hidden>·</span>
                <span>{draft.task.estimatedMinutes} min</span>
                {draft.task.isRecurring ? (
                  <span className="inline-flex items-center gap-1">
                    <span aria-hidden>·</span>
                    <Repeat size={11} aria-hidden />
                    Repeats
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {saveFailed ? (
        <p className="mt-3 text-sm text-red-600">
          Something went wrong adding the tasks. Please try again.
        </p>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-3">
        <span className="text-xs text-app-text-muted">{chosen.length} selected</span>
        <div className="flex gap-3">
          <button type="button" onClick={handleClose} className={secondaryBtn}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={`${primaryBtn} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {isSaving
              ? 'Adding…'
              : `Accept ${chosen.length} task${chosen.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
