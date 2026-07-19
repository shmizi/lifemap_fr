// ScopeCutNudge — the hard-deadline escalation on the Goal Detail page (Phase 10).
//
// The counterpart to the reschedule nudge. A SOFT-deadline miss just reschedules
// mechanically; a HARD deadline can't move, so when the goal is projected to miss it,
// rescheduling can't help — the coach has to propose TRIMMING SCOPE, and the USER
// approves. This nudge only renders when the goal is behind AND its deadline is hard
// (the parent decides that from the goal's projection + hardness, cheaply, no AI); it
// then owns the generate → review → apply flow.
//
// It never touches a provider, the engine, or a repository directly — the store's
// generateScopeCutProposal / applyScopeCut do the work; this component is UI + intent.

import { useState } from 'react'
import { AlertTriangle, Scissors, Check } from 'lucide-react'
import type { ID } from '@/core/types'
import type {
  ScopeCutAction,
  ScopeCutProposal,
  ScopeCutSuggestion,
} from '@/engine/ai/types'
import { useGoalStore, type ScopeCutApplyResult } from '@/store/useGoalStore'

type Phase = 'idle' | 'loading' | 'review' | 'applying' | 'done'

// How each action reads to the user, and whether it is safe to pre-select. 'cut'
// deletes work, so it is never checked by default — the user opts into it. 'defer'
// (move to backlog) and 'compress' (advice only) are reversible/harmless, so they
// start checked to make the common "trim the edges" path one click.
const ACTION_META: Record<
  ScopeCutAction,
  { label: string; tone: string; defaultChecked: boolean }
> = {
  cut: { label: 'Remove', tone: 'text-red-600', defaultChecked: false },
  defer: { label: 'Do later', tone: 'text-amber-600', defaultChecked: true },
  compress: { label: 'Do less', tone: 'text-app-text-muted', defaultChecked: true },
}

export function ScopeCutNudge({
  goalId,
  daysBehind,
}: {
  goalId: ID
  daysBehind: number
}) {
  const generateScopeCutProposal = useGoalStore((s) => s.generateScopeCutProposal)
  const applyScopeCut = useGoalStore((s) => s.applyScopeCut)

  const [phase, setPhase] = useState<Phase>('idle')
  const [proposal, setProposal] = useState<ScopeCutProposal | null>(null)
  const [approved, setApproved] = useState<Set<number>>(new Set())
  const [result, setResult] = useState<ScopeCutApplyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const behindLabel =
    daysBehind < 10
      ? `${daysBehind} day${daysBehind === 1 ? '' : 's'}`
      : `~${Math.round(daysBehind / 7)} week${Math.round(daysBehind / 7) === 1 ? '' : 's'}`

  async function handleGenerate() {
    setPhase('loading')
    setError(null)
    try {
      const p = await generateScopeCutProposal(goalId)
      if (!p) {
        setError('No proposal came back this time. You can try again.')
        setPhase('idle')
        return
      }
      // Pre-select the reversible actions (defer/compress), leave destructive cuts
      // for the user to opt into.
      const preset = new Set<number>()
      p.suggestions.forEach((s, i) => {
        if (ACTION_META[s.action].defaultChecked) preset.add(i)
      })
      setProposal(p)
      setApproved(preset)
      setPhase('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not draft a scope cut.')
      setPhase('idle')
    }
  }

  function toggle(index: number) {
    setApproved((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function handleApply() {
    if (!proposal || approved.size === 0) return
    const chosen: ScopeCutSuggestion[] = proposal.suggestions.filter((_, i) =>
      approved.has(i),
    )
    setPhase('applying')
    setError(null)
    try {
      const r = await applyScopeCut(goalId, chosen)
      setResult(r)
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply the changes.')
      setPhase('review')
    }
  }

  return (
    <section className="mt-4 rounded-app-lg border border-amber-500/40 bg-amber-500/5 p-5">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold text-app-text">
            Behind on a deadline that can’t move
          </h2>
          <p className="mt-1 text-sm text-app-text-muted">
            At the current pace this goal is heading for its hard deadline about{' '}
            <span className="font-medium text-amber-600">{behindLabel}</span> late.
            The date is fixed, so the plan has to give. Let the coach propose what to
            trim — you decide what actually changes.
          </p>
        </div>
      </div>

      {phase === 'idle' ? (
        <button
          type="button"
          onClick={handleGenerate}
          className="mt-4 inline-flex items-center gap-2 rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        >
          <Scissors size={16} aria-hidden />
          Trim scope with AI
        </button>
      ) : null}

      {phase === 'loading' ? (
        <p className="mt-4 animate-pulse text-sm text-app-text-muted">
          Working out what to protect and what to trim…
        </p>
      ) : null}

      {phase === 'review' && proposal ? (
        <div className="mt-4">
          {proposal.summary.trim().length > 0 ? (
            <p className="text-sm text-app-text">{proposal.summary}</p>
          ) : null}

          <ul className="mt-3 space-y-2">
            {proposal.suggestions.map((s, i) => {
              const meta = ACTION_META[s.action]
              return (
                <li
                  key={i}
                  className="flex gap-3 rounded-app-lg border border-app-border bg-app-surface p-3"
                >
                  <input
                    type="checkbox"
                    checked={approved.has(i)}
                    onChange={() => toggle(i)}
                    className="mt-1 h-4 w-4 shrink-0 accent-app-text"
                    aria-label={`Approve: ${meta.label} ${s.target}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-app-text">
                      <span className={`font-semibold uppercase tracking-wide ${meta.tone}`}>
                        {meta.label}
                      </span>{' '}
                      <span className="font-medium">{s.target}</span>
                    </p>
                    {s.rationale.trim().length > 0 ? (
                      <p className="mt-0.5 text-xs text-app-text-muted">{s.rationale}</p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleApply}
              disabled={approved.size === 0}
              className="inline-flex items-center gap-1.5 rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              <Check size={15} aria-hidden />
              Apply {approved.size} change{approved.size === 1 ? '' : 's'}
            </button>
            <button
              type="button"
              onClick={() => setPhase('idle')}
              className="inline-flex items-center rounded-app-lg border border-app-border px-3 py-2 text-sm font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              Not now
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'applying' ? (
        <p className="mt-4 animate-pulse text-sm text-app-text-muted">
          Reshaping the plan…
        </p>
      ) : null}

      {phase === 'done' && result ? (
        <div className="mt-4">
          <p className="text-sm text-app-text">{summarizeResult(result)}</p>
          {result.unmatched.length > 0 ? (
            <p className="mt-1 text-xs text-app-text-muted">
              Couldn’t find a match for: {result.unmatched.join(', ')}. You can trim
              those by hand.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="mt-3 inline-flex items-center rounded-app-lg border border-app-border px-3 py-1.5 text-sm font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          >
            Done
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </section>
  )
}

// One plain-language line describing what actually changed, so the user sees the
// effect without re-reading the plan.
function summarizeResult(r: ScopeCutApplyResult): string {
  const parts: string[] = []
  if (r.cut > 0) parts.push(`removed ${r.cut}`)
  if (r.deferred > 0) parts.push(`moved ${r.deferred} to your Later backlog`)
  const acted = parts.length > 0 ? `Done — ${parts.join(', ')}.` : 'No changes were applied.'
  if (r.compressAdvised > 0) {
    return `${acted} ${r.compressAdvised} suggestion${r.compressAdvised === 1 ? '' : 's'} to do less — trim ${r.compressAdvised === 1 ? 'that one' : 'those'} yourself where it fits.`
  }
  return acted
}
