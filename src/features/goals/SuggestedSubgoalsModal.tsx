// SuggestedSubgoalsModal — the accept / edit / reject step for AI-suggested
// subgoals (Phase 5).
//
// The sibling of SuggestedMilestonesModal, one level up the hierarchy: it
// suggests the major parts a GOAL breaks into. On open it asks the store
// (store.suggestSubgoals -> AIProvider -> shared parser), lets the user edit each
// title/description and uncheck the ones they don't want, then writes the kept
// ones through the EXISTING addSubgoal path (with aiSuggested NOT a concept for
// subgoals — they have no such flag, unlike milestones). Pure presentation +
// local state; never imports a provider, the engine, or a repository.
//
// One modal per entity is the established Phase 1 convention, so this is a
// separate component from the milestone modal rather than a generic shared one.
// The fetch body lives in <SuggestedSubgoalsBody>, mounted fresh on each open and
// on Retry, so it starts in 'loading' via its useState initializer and the fetch
// effect only ever updates state inside its async callbacks.

import { useEffect, useState } from 'react'
import type { ID } from '@/core/types'
import { DEFAULT_SUBGOAL_STATUS } from '@/core/constants'
import { useGoalStore } from '@/store/useGoalStore'
import type { SubgoalSuggestionContext } from '@/engine/ai/types'
import { Modal } from '@/components/ui/Modal'

interface SuggestedSubgoalsModalProps {
  open: boolean
  onClose: () => void
  goalId: ID
  // Everything the prompt needs, assembled by the caller from the loaded goal.
  context: SubgoalSuggestionContext
}

type Phase = 'loading' | 'error' | 'ready'

interface DraftSubgoal {
  include: boolean
  title: string
  description: string
}

const inputClass =
  'w-full rounded-app-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'

export function SuggestedSubgoalsModal({
  open,
  onClose,
  goalId,
  context,
}: SuggestedSubgoalsModalProps) {
  // isSaving lives in the wrapper (not the remounted body) so closing can be
  // blocked mid-save. `attempt` is bumped by Retry to remount the body and re-run
  // its mount-time fetch.
  const [isSaving, setIsSaving] = useState(false)
  const [attempt, setAttempt] = useState(0)

  function handleClose() {
    if (isSaving) return
    onClose()
  }

  return (
    <Modal isOpen={open} onClose={handleClose} title="Suggested subgoals">
      {open ? (
        <SuggestedSubgoalsBody
          key={attempt}
          goalId={goalId}
          context={context}
          isSaving={isSaving}
          setIsSaving={setIsSaving}
          onRetry={() => setAttempt((a) => a + 1)}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  )
}

interface SuggestedSubgoalsBodyProps {
  goalId: ID
  context: SubgoalSuggestionContext
  isSaving: boolean
  setIsSaving: (saving: boolean) => void
  onRetry: () => void
  onClose: () => void
}

function SuggestedSubgoalsBody({
  goalId,
  context,
  isSaving,
  setIsSaving,
  onRetry,
  onClose,
}: SuggestedSubgoalsBodyProps) {
  const suggestSubgoals = useGoalStore((s) => s.suggestSubgoals)
  const addSubgoal = useGoalStore((s) => s.addSubgoal)

  const [phase, setPhase] = useState<Phase>('loading')
  const [drafts, setDrafts] = useState<DraftSubgoal[]>([])
  const [saveFailed, setSaveFailed] = useState(false)

  // Fetch once on mount. The wrapper remounts this body on each open and on
  // Retry, so a single mount-time fetch covers both cases — and every state
  // update here happens inside the async callbacks, not synchronously.
  useEffect(() => {
    let active = true
    suggestSubgoals(context)
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
  }, [])

  const update = (index: number, patch: Partial<DraftSubgoal>) =>
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
      // Sequential, not parallel: addSubgoal derives each subgoal's order from
      // max(siblings)+1, so the writes must not race — this keeps them in the
      // listed order and collision-free.
      for (const d of chosen) {
        await addSubgoal({
          goalId,
          title: d.title.trim(),
          description: d.description.trim(),
          status: DEFAULT_SUBGOAL_STATUS,
          requiresConsistency: false,
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
    <>
      {phase === 'loading' ? (
        <p className="mt-6 mb-2 animate-pulse text-sm text-app-text-muted">
          Thinking of the major parts of this goal...
        </p>
      ) : null}

      {phase === 'error' ? (
        <div className="mt-5">
          <p className="text-sm text-app-text-muted">
            Could not get suggestions just now. You can try again or add subgoals
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
      ) : null}

      {phase === 'ready' && drafts.length === 0 ? (
        <div className="mt-5">
          <p className="text-sm text-app-text-muted">
            No suggestions this time. You can add subgoals yourself.
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
                    aria-label={`Include ${draft.title || 'this subgoal'}`}
                    className="mt-2 shrink-0 accent-app-text"
                  />
                  <div
                    className={`flex-1 space-y-2 ${draft.include ? '' : 'opacity-50'}`}
                  >
                    <input
                      type="text"
                      value={draft.title}
                      onChange={(e) => update(index, { title: e.target.value })}
                      placeholder="Subgoal title"
                      className={inputClass}
                    />
                    <textarea
                      value={draft.description}
                      onChange={(e) =>
                        update(index, { description: e.target.value })
                      }
                      rows={2}
                      placeholder="What does this part involve? (optional)"
                      className={`${inputClass} resize-none`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {saveFailed ? (
            <p className="mt-3 text-sm text-red-600">
              Something went wrong adding the subgoals. Please try again.
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
                  : `Add ${chosen.length} subgoal${chosen.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

const secondaryBtn =
  'rounded-app-lg border border-app-border px-4 py-2 text-sm font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'
const primaryBtn =
  'rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'
