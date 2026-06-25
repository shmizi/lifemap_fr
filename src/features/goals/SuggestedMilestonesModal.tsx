// SuggestedMilestonesModal — the accept / edit / reject step for AI-suggested
// milestones (Phase 5, layer 3).
//
// On open it asks the store for milestone suggestions for one subgoal
// (store.suggestMilestones -> AIProvider -> pure parser), then lets the user edit
// each title/description and uncheck the ones they don't want. "Add" writes the
// kept ones through the EXISTING addMilestone path with aiSuggested: true — there
// is no AI-specific write path. This file is pure presentation + local state; it
// never imports a provider, the engine, or a repository.
//
// Three calm states, never a crash:
//   - loading  : the request is in flight
//   - error    : the provider rejected (only a real backend can; offers retry)
//   - ready    : suggestions arrived (possibly NONE — a malformed model reply
//                parses to [], which we present as "nothing this time", not a fault)

import { useEffect, useState } from 'react'
import type { ID } from '@/core/types'
import { DEFAULT_MILESTONE_STATUS } from '@/core/constants'
import { useGoalStore } from '@/store/useGoalStore'
import type { MilestoneSuggestionContext } from '@/engine/ai/types'
import { Modal } from '@/components/ui/Modal'

interface SuggestedMilestonesModalProps {
  open: boolean
  onClose: () => void
  subgoalId: ID
  // Everything the prompt needs, assembled by the caller from the loaded tree.
  context: MilestoneSuggestionContext
}

type Phase = 'loading' | 'error' | 'ready'

// One suggestion as the user edits it before accepting. `include` is the
// accept/reject toggle (default on); title/description are freely editable.
interface DraftMilestone {
  include: boolean
  title: string
  description: string
}

const inputClass =
  'w-full rounded-app-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'

export function SuggestedMilestonesModal({
  open,
  onClose,
  subgoalId,
  context,
}: SuggestedMilestonesModalProps) {
  const suggestMilestones = useGoalStore((s) => s.suggestMilestones)
  const addMilestone = useGoalStore((s) => s.addMilestone)

  const [phase, setPhase] = useState<Phase>('loading')
  const [drafts, setDrafts] = useState<DraftMilestone[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  // Bumped to re-run the fetch (open, and Retry). Keeping the effect keyed on a
  // primitive avoids re-firing on the `context` object's changing identity.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!open) return
    // `active` guards against a slow response from a previous open landing after
    // the modal was closed/reopened and overwriting fresh state.
    let active = true
    setPhase('loading')
    setSaveFailed(false)
    suggestMilestones(context)
      .then((suggestions) => {
        if (!active) return
        setDrafts(
          suggestions.map((s) => ({
            include: true,
            title: s.title,
            description: s.description ?? '',
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

  const update = (index: number, patch: Partial<DraftMilestone>) =>
    setDrafts((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    )

  // Kept = checked AND has a non-blank title (an emptied title silently drops it).
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
      // Sequential, not parallel: addMilestone derives each milestone's order
      // from max(siblings)+1, so the writes must not race — this keeps them in
      // the listed order and collision-free.
      for (const d of chosen) {
        await addMilestone({
          subgoalId,
          title: d.title.trim(),
          status: DEFAULT_MILESTONE_STATUS,
          aiSuggested: true,
          ...(d.description.trim() ? { description: d.description.trim() } : {}),
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
    <Modal isOpen={open} onClose={handleClose} title="Suggested milestones">
      {phase === 'loading' ? (
        <p className="mt-6 mb-2 animate-pulse text-sm text-app-text-muted">
          Thinking of milestones for this subgoal...
        </p>
      ) : null}

      {phase === 'error' ? (
        <div className="mt-5">
          <p className="text-sm text-app-text-muted">
            Could not get suggestions just now. You can try again or add
            milestones yourself.
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
            No suggestions this time. You can add milestones yourself.
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
            Edit or uncheck any, then add the ones you want.
          </p>

          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            {drafts.map((draft, index) => (
              <div
                key={index}
                className="rounded-app-lg border border-app-border p-3"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={draft.include}
                    onChange={(e) =>
                      update(index, { include: e.target.checked })
                    }
                    aria-label={`Include ${draft.title || 'this milestone'}`}
                    className="mt-2 shrink-0 accent-app-text"
                  />
                  <div
                    className={`flex-1 space-y-2 ${draft.include ? '' : 'opacity-50'}`}
                  >
                    <input
                      type="text"
                      value={draft.title}
                      onChange={(e) => update(index, { title: e.target.value })}
                      placeholder="Milestone title"
                      className={inputClass}
                    />
                    <textarea
                      value={draft.description}
                      onChange={(e) =>
                        update(index, { description: e.target.value })
                      }
                      rows={2}
                      placeholder="What marks this done? (optional)"
                      className={`${inputClass} resize-none`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {saveFailed ? (
            <p className="mt-3 text-sm text-red-600">
              Something went wrong adding the milestones. Please try again.
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
                  : `Add ${chosen.length} milestone${chosen.length === 1 ? '' : 's'}`}
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
