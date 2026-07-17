// StrategyBriefPanel — the Direction layer on the Goal Detail page (Phase 10).
//
// Shows the goal's stored Strategy Brief (the coach's read on the real target and
// what matters most) and owns its generation. The Stage-0 intake modal is a pure
// input collector: it hands the answers back via onBuild and closes, then THIS
// panel runs generateStrategyBrief and shows its own progress. Keeping the async
// work here (in a component that stays mounted while the brief lands) is what makes
// the flow reliable — the modal never awaits across its own close.
//
// It reads the brief via useStrategyBrief (Repository -> Store -> Hook -> UI) and
// never touches a provider, the engine, or a repository directly.
//
// WHY it sits ABOVE the roadmap on the page: direction precedes execution. The
// brief answers "what am I really aiming at, and what matters most?" before the
// subgoals/tasks answer "what do I do?".

import { useState } from 'react'
import { Compass, Sparkles } from 'lucide-react'
import type { ID } from '@/core/types'
import type { IntakeExchange } from '@/engine/ai/types'
import { useStrategyBrief } from '@/core/hooks/useStrategyBrief'
import { useGoalStore } from '@/store/useGoalStore'
import { StrategyIntakeModal } from '@/features/goals/StrategyIntakeModal'

export function StrategyBriefPanel({ goalId }: { goalId: ID }) {
  const { brief, isLoading } = useStrategyBrief(goalId)
  const generateStrategyBrief = useGoalStore((s) => s.generateStrategyBrief)

  const [isIntakeOpen, setIsIntakeOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Called by the intake modal once it has collected answers (and after it closes).
  // The panel owns the async generation and its progress so no await spans the
  // modal's lifecycle. On success generateStrategyBrief writes the brief and
  // refreshes the store slot, so the display below updates on its own.
  async function handleBuild(intake: IntakeExchange[]) {
    if (isGenerating) return
    setIsGenerating(true)
    setError(null)
    try {
      const result = await generateStrategyBrief(
        goalId,
        intake.length > 0 ? intake : undefined,
      )
      if (!result) {
        // The provider answered but nothing parseable came back — a calm miss, not
        // a failure. The existing brief (if any) is left untouched.
        setError('No brief came back this time. You can try again.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate the brief.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <section className="mt-4 rounded-app-lg border border-app-border bg-app-surface-alt p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-app-text-muted">
          <Compass size={15} aria-hidden />
          Direction
        </h2>
        {/* Regenerate is only offered once a brief exists and nothing is in flight;
            the empty state has its own primary button below. Both open the intake. */}
        {brief && !isGenerating ? (
          <button
            type="button"
            onClick={() => setIsIntakeOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-app-lg border border-app-border px-3 py-1.5 text-xs font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          >
            <Sparkles size={13} aria-hidden />
            Regenerate
          </button>
        ) : null}
      </div>

      {/* Generation in progress (owned here, not the modal). */}
      {isGenerating ? (
        <p className="mt-3 animate-pulse text-sm text-app-text-muted">
          Thinking it through…
        </p>
      ) : null}

      {/* Initial read of a not-yet-known brief. */}
      {!isGenerating && isLoading && !brief ? (
        <p className="mt-3 animate-pulse text-sm text-app-text-muted">
          Loading your strategy…
        </p>
      ) : null}

      {/* No brief yet: explain what it is and offer to generate one. */}
      {!isGenerating && !isLoading && !brief ? (
        <div className="mt-3">
          <p className="text-sm text-app-text-muted">
            Before the tasks, get your bearings. A strategy brief sharpens what this
            goal is really aiming at and ranks what matters most — tailored to you.
          </p>
          <button
            type="button"
            onClick={() => setIsIntakeOpen(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          >
            <Sparkles size={16} aria-hidden />
            Generate strategy brief
          </button>
        </div>
      ) : null}

      {/* The brief itself (kept visible even while regenerating). */}
      {brief ? (
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-base font-medium text-app-text">
              {brief.sharpenedTarget}
            </p>
            {brief.theme.trim().length > 0 ? (
              <span className="mt-2 inline-block rounded-full border border-app-border px-2.5 py-0.5 text-xs text-app-text-muted">
                {brief.theme}
              </span>
            ) : null}
          </div>

          {brief.priorities.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">
                What matters most
              </h3>
              <ol className="mt-2 space-y-2">
                {brief.priorities.map((p, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-app-text text-xs font-semibold text-app-surface">
                      {i + 1}
                    </span>
                    <span className="text-sm text-app-text">
                      <span className="font-medium">{p.title}</span>
                      {p.rationale.trim().length > 0 ? (
                        <span className="text-app-text-muted"> — {p.rationale}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {brief.notes.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">
                Notes
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {brief.notes.map((note, i) => (
                  <li key={i} className="text-sm text-app-text-muted">
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}

      {/* Stage-0 intake conversation. It only collects answers and closes; this
          panel generates the brief from them (see handleBuild). */}
      <StrategyIntakeModal
        open={isIntakeOpen}
        onClose={() => setIsIntakeOpen(false)}
        goalId={goalId}
        onBuild={handleBuild}
      />
    </section>
  )
}
