// PlanRevisionPanel — "something changed" on the Goal Detail page.
//
// The general adaptation path. A roadmap is generated from what was true the day it
// was made; weeks later parts of it can simply be the wrong work — a tool swapped, a
// course changed, a job started, an exam moved. The other adaptation routes each
// miss this: the "what I've learned" note only steers FUTURE generations, the phase
// check-in only opens at a phase boundary and only touches the brief, and the
// scope-cut nudge only appears when a HARD deadline is at risk. A plan can be
// perfectly on schedule and still be obsolete.
//
// Flow: describe the change → the coach proposes which parts it invalidates → the
// user approves each one → apply. Nothing destructive happens without approval, and
// destructive actions ('drop') start UNCHECKED, matching ScopeCutNudge's discipline.
//
// It owns no business logic: generatePlanRevisionProposal / applyPlanRevision do the
// work, this is UI and intent.

import { useState } from 'react'
import { Check, History, Wand2 } from 'lucide-react'
import type { ID } from '@/core/types'
import type {
  PlanRevisionAction,
  PlanRevisionProposal,
  PlanRevisionSuggestion,
} from '@/engine/ai/types'
import { useGoalStore, type PlanRevisionApplyResult } from '@/store/useGoalStore'

type Phase = 'idle' | 'loading' | 'review' | 'applying' | 'done'

// How each action reads, and whether it is safe to pre-select. 'drop' destroys work,
// so the user opts INTO it; 'defer' (reversible — the work moves to the undated
// backlog) and 'replan' (clears only unfinished tasks, keeping the structure and all
// completed work) start checked so the common path is one click.
const ACTION_META: Record<
  PlanRevisionAction,
  { label: string; tone: string; defaultChecked: boolean; hint: string }
> = {
  drop: {
    label: 'Remove',
    tone: 'text-red-600',
    defaultChecked: false,
    hint: 'Deletes it and its tasks',
  },
  defer: {
    label: 'Do later',
    tone: 'text-amber-600',
    defaultChecked: true,
    hint: 'Moves its tasks off the schedule, keeps them',
  },
  replan: {
    label: 'Plan again',
    tone: 'text-app-text',
    defaultChecked: true,
    hint: 'Clears unfinished tasks so it can be re-planned; finished work is kept',
  },
}

export function PlanRevisionPanel({ goalId }: { goalId: ID }) {
  const generateProposal = useGoalStore((s) => s.generatePlanRevisionProposal)
  const applyRevision = useGoalStore((s) => s.applyPlanRevision)

  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [proposal, setProposal] = useState<PlanRevisionProposal | null>(null)
  const [approved, setApproved] = useState<Set<number>>(new Set())
  const [result, setResult] = useState<PlanRevisionApplyResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setNote('')
    setPhase('idle')
    setProposal(null)
    setApproved(new Set())
    setResult(null)
    setError(null)
  }

  async function handleGenerate() {
    if (note.trim().length === 0) return
    setPhase('loading')
    setError(null)
    try {
      const p = await generateProposal(goalId, note)
      if (!p) {
        setError('Nothing came back this time. You can try again.')
        setPhase('idle')
        return
      }
      const preset = new Set<number>()
      p.suggestions.forEach((s, i) => {
        if (ACTION_META[s.action].defaultChecked) preset.add(i)
      })
      setProposal(p)
      setApproved(preset)
      setPhase('review')
    } catch {
      setError('Could not check the plan just now. Please try again.')
      setPhase('idle')
    }
  }

  async function handleApply() {
    if (!proposal) return
    setPhase('applying')
    setError(null)
    try {
      const chosen: PlanRevisionSuggestion[] = proposal.suggestions.filter((_, i) =>
        approved.has(i),
      )
      setResult(await applyRevision(goalId, note, chosen))
      setPhase('done')
    } catch {
      setError('Could not update the plan just now. Please try again.')
      setPhase('review')
    }
  }

  const toggle = (i: number) =>
    setApproved((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <section className="mt-4 border border-app-border bg-app-surface-alt p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-app-text">
          <History size={13} aria-hidden />
          Something changed
        </h2>
        {open ? (
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              reset()
            }}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-app-text-muted transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          >
            Close
          </button>
        ) : null}
      </div>
      <div className="mt-2 border-t border-app-border" />

      {!open ? (
        <>
          <p className="mt-3 text-xs leading-relaxed text-app-text-muted">
            Switched tools, changed course, started a job, moved an exam? Describe it
            and the plan is checked against it — parts that no longer make sense are
            proposed for removal or re-planning, and your direction is updated so
            future plans account for it.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-3 inline-flex items-center gap-1.5 border border-app-border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-app-text transition hover:bg-app-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          >
            <Wand2 size={14} aria-hidden />
            Tell it what changed
          </button>
        </>
      ) : phase === 'done' && result ? (
        <div className="mt-3">
          <p className="flex items-start gap-1.5 text-sm text-app-text">
            <Check size={15} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              {summarise(result)}
              {result.directionUpdated
                ? ' Your direction was updated too, so future plans account for it.'
                : ' The plan was updated, but your direction could not be refreshed — try describing the change again later.'}
            </span>
          </p>
          {result.unmatched.length > 0 ? (
            <p className="mt-2 text-xs text-app-text-muted">
              Couldn&rsquo;t find {result.unmatched.join(', ')} in the plan — handle
              those by hand.
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="mt-3 border border-app-border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-app-text transition hover:bg-app-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          >
            Done
          </button>
        </div>
      ) : /* 'applying' stays in this branch: it is the review view with its button
            in a pending state. Matching only 'review' would drop the user back to
            the empty textarea for the duration of the write. */
      (phase === 'review' || phase === 'applying') && proposal ? (
        <div className="mt-3">
          {proposal.summary ? (
            <p className="text-sm text-app-text">{proposal.summary}</p>
          ) : null}

          {proposal.suggestions.length === 0 ? (
            <p className="mt-2 text-sm text-app-text-muted">
              Nothing in the plan needs to change — the direction note is still worth
              keeping, so it&rsquo;s been folded in.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {proposal.suggestions.map((s, i) => {
                const meta = ACTION_META[s.action]
                return (
                  <li key={`${s.target}-${i}`}>
                    <label className="flex cursor-pointer items-start gap-2.5 border border-app-border bg-app-surface p-3">
                      <input
                        type="checkbox"
                        checked={approved.has(i)}
                        onChange={() => toggle(i)}
                        className="mt-0.5 shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-2">
                          <span className="text-sm font-medium text-app-text">
                            {s.target}
                          </span>
                          <span
                            className={`font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${meta.tone}`}
                          >
                            {meta.label}
                          </span>
                        </span>
                        {s.rationale ? (
                          <span className="mt-1 block text-xs text-app-text-muted">
                            {s.rationale}
                          </span>
                        ) : null}
                        <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-app-text-muted">
                          {meta.hint}
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleApply}
              disabled={phase === 'applying'}
              className="inline-flex items-center gap-1.5 bg-app-text px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-app-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              {phase === 'applying'
                ? 'Updating the plan…'
                : approved.size > 0
                  ? `Apply ${approved.size} change${approved.size === 1 ? '' : 's'}`
                  : 'Update direction only'}
            </button>
            <button
              type="button"
              onClick={() => setPhase('idle')}
              className="px-2 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-app-text-muted transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              Back
            </button>
          </div>
          {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        </div>
      ) : (
        <div className="mt-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. The course switched from Python to Rust, so the pandas material isn't relevant any more."
            className="w-full resize-none border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={phase === 'loading' || note.trim().length === 0}
            className="mt-2 inline-flex items-center gap-1.5 bg-app-text px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-app-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          >
            <Wand2 size={14} aria-hidden />
            {phase === 'loading' ? 'Checking the plan…' : 'Check the plan'}
          </button>
          {phase === 'loading' ? (
            <p className="mt-2 animate-pulse text-xs text-app-text-muted">
              Working out what this makes obsolete…
            </p>
          ) : null}
          {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        </div>
      )}
    </section>
  )
}

// Plain-language recap of what actually landed.
function summarise(r: PlanRevisionApplyResult): string {
  const parts: string[] = []
  if (r.dropped > 0) parts.push(`removed ${r.dropped}`)
  if (r.deferred > 0) parts.push(`moved ${r.deferred} to later`)
  if (r.replanned > 0)
    parts.push(`cleared ${r.replanned} for re-planning`)
  if (parts.length === 0) return 'No changes were made to the plan.'
  return `Updated the plan — ${parts.join(', ')}.`
}
