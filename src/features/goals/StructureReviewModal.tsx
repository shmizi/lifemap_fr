// StructureReviewModal — the review / edit / accept step for an AI-proposed goal
// STRUCTURE (Phase 10). The structure builder used to write tracks + phases straight
// to the database; this puts a human gate in front of it, matching the accept flow the
// suggestion features already use (SuggestedSubgoalsModal / SuggestedMilestonesModal).
//
// On open it asks the store for a PROPOSAL only (store.generateStructureProposal ->
// AIProvider -> parseStructure), lets the user edit each track/phase title, drop the
// ones they don't want, then writes the kept skeleton via store.applyStructure (the
// existing addSubgoal / addMilestone paths). Nothing is written until Accept. Pure
// presentation + local draft state; never touches a provider, engine, or repository.
//
// Same wrapper/body shape as SuggestedSubgoalsModal: the body is remounted on each
// open and on Retry, so it starts in 'loading' via its initializer and the mount-time
// fetch covers both cases. isSaving lives in the wrapper so closing can be blocked
// mid-write.

import { useEffect, useState } from 'react'
import type { ID } from '@/core/types'
import type { PlannedTrack } from '@/engine/ai/types'
import { useGoalStore } from '@/store/useGoalStore'
import { Modal } from '@/components/ui/Modal'

interface StructureReviewModalProps {
  open: boolean
  onClose: () => void
  goalId: ID
}

type Phase = 'loading' | 'error' | 'ready'

interface DraftPhase {
  include: boolean
  title: string
  description: string
}
interface DraftTrack {
  include: boolean
  title: string
  description: string
  phases: DraftPhase[]
}

const inputClass =
  'w-full rounded-app-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'
const secondaryBtn =
  'rounded-app-lg border border-app-border px-4 py-2 text-sm font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'
const primaryBtn =
  'rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'

export function StructureReviewModal({
  open,
  onClose,
  goalId,
}: StructureReviewModalProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [attempt, setAttempt] = useState(0)

  function handleClose() {
    if (isSaving) return
    onClose()
  }

  return (
    <Modal isOpen={open} onClose={handleClose} title="Review the plan structure">
      {open ? (
        <StructureReviewBody
          key={attempt}
          goalId={goalId}
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
  goalId: ID
  isSaving: boolean
  setIsSaving: (saving: boolean) => void
  onRetry: () => void
  onClose: () => void
}

function StructureReviewBody({
  goalId,
  isSaving,
  setIsSaving,
  onRetry,
  onClose,
}: BodyProps) {
  const generateStructureProposal = useGoalStore((s) => s.generateStructureProposal)
  const applyStructure = useGoalStore((s) => s.applyStructure)

  const [phase, setPhase] = useState<Phase>('loading')
  const [tracks, setTracks] = useState<DraftTrack[]>([])
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    let active = true
    generateStructureProposal(goalId)
      .then((proposal) => {
        if (!active) return
        setTracks(
          proposal.map((t) => ({
            include: true,
            title: t.title,
            description: t.description ?? '',
            phases: t.phases.map((p) => ({
              include: true,
              title: p.title,
              description: p.description ?? '',
            })),
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

  const updateTrack = (ti: number, patch: Partial<DraftTrack>) =>
    setTracks((prev) => prev.map((t, i) => (i === ti ? { ...t, ...patch } : t)))
  const updatePhase = (ti: number, pi: number, patch: Partial<DraftPhase>) =>
    setTracks((prev) =>
      prev.map((t, i) =>
        i === ti
          ? {
              ...t,
              phases: t.phases.map((p, j) => (j === pi ? { ...p, ...patch } : p)),
            }
          : t,
      ),
    )

  // A track counts only when kept AND named; its phases likewise. An empty title
  // drops the item, matching applyStructure's own skip.
  const keptTracks = tracks.filter((t) => t.include && t.title.trim().length > 0)
  const keptPhaseCount = keptTracks.reduce(
    (n, t) =>
      n + t.phases.filter((p) => p.include && p.title.trim().length > 0).length,
    0,
  )
  const canSave = keptTracks.length > 0 && !isSaving

  function handleClose() {
    if (isSaving) return
    onClose()
  }

  async function handleSave() {
    if (!canSave) return
    setIsSaving(true)
    setSaveFailed(false)
    try {
      const toWrite: PlannedTrack[] = keptTracks.map((t) => ({
        title: t.title.trim(),
        description: t.description.trim() || undefined,
        phases: t.phases
          .filter((p) => p.include && p.title.trim().length > 0)
          .map((p) => ({
            title: p.title.trim(),
            ...(p.description.trim() ? { description: p.description.trim() } : {}),
          })),
      }))
      await applyStructure(goalId, toWrite)
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
        Mapping this goal into tracks and phases…
      </p>
    )
  }

  if (phase === 'error') {
    return (
      <div className="mt-5">
        <p className="text-sm text-app-text-muted">
          Could not draft a structure just now. You can try again or build it
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

  if (tracks.length === 0) {
    return (
      <div className="mt-5">
        <p className="text-sm text-app-text-muted">
          No structure came back this time. You can add subgoals yourself.
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
        Here&rsquo;s the shape of the plan — each track becomes a subgoal, each phase a
        milestone. Edit or drop any, then accept the ones you want.
      </p>

      <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
        {tracks.map((track, ti) => (
          <div key={ti} className="rounded-app-lg border border-app-border p-3">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={track.include}
                onChange={(e) => updateTrack(ti, { include: e.target.checked })}
                aria-label={`Include ${track.title || 'this track'}`}
                className="mt-2 shrink-0 accent-app-text"
              />
              <div className={`flex-1 space-y-2 ${track.include ? '' : 'opacity-50'}`}>
                <input
                  type="text"
                  value={track.title}
                  onChange={(e) => updateTrack(ti, { title: e.target.value })}
                  placeholder="Track title"
                  className={`${inputClass} font-medium`}
                />

                {/* Nested phases (milestones). */}
                {track.phases.length > 0 ? (
                  <div className="space-y-1.5 border-l border-app-border pl-3">
                    {track.phases.map((p, pi) => (
                      <div key={pi} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={p.include}
                          onChange={(e) =>
                            updatePhase(ti, pi, { include: e.target.checked })
                          }
                          aria-label={`Include phase ${p.title || 'this phase'}`}
                          className="shrink-0 accent-app-text"
                        />
                        <input
                          type="text"
                          value={p.title}
                          onChange={(e) =>
                            updatePhase(ti, pi, { title: e.target.value })
                          }
                          placeholder="Phase title"
                          className={`${inputClass} py-1.5 text-xs ${p.include ? '' : 'opacity-50'}`}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="pl-3 text-xs text-app-text-muted">
                    No phases — you can add them later.
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {saveFailed ? (
        <p className="mt-3 text-sm text-red-600">
          Something went wrong creating the structure. Please try again.
        </p>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-3">
        <span className="text-xs text-app-text-muted">
          {keptTracks.length} track{keptTracks.length === 1 ? '' : 's'},{' '}
          {keptPhaseCount} phase{keptPhaseCount === 1 ? '' : 's'}
        </span>
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
              ? 'Creating…'
              : `Accept ${keptTracks.length} track${keptTracks.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
