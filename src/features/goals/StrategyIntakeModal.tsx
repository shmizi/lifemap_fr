// StrategyIntakeModal — the Stage-0 intake conversation (Phase 10).
//
// A short, model-driven interview that precedes the strategy brief: it asks the
// provider for the few highest-leverage, goal-specific questions and lets the user
// answer them (all optional). It is a PURE INPUT COLLECTOR — on submit it hands the
// answers up via onBuild and closes SYNCHRONOUSLY; the parent panel performs the
// (async) brief generation and shows its own progress. Keeping the long-running
// generation OUT of the modal avoids an await that would span the modal's own
// re-render/unmount when the brief lands.
//
// Follows the Phase 1 "one modal per entity" convention and the fetch-on-mount body
// pattern from SuggestedSubgoalsModal: the body is remounted (keyed on `attempt`)
// on open and on Retry, so its mount-time question fetch covers both, and every
// state update happens inside async callbacks.

import { useEffect, useState } from 'react'
import type { ID } from '@/core/types'
import type { IntakeExchange } from '@/engine/ai/types'
import { useGoalStore } from '@/store/useGoalStore'
import { Modal } from '@/components/ui/Modal'

interface StrategyIntakeModalProps {
  open: boolean
  onClose: () => void
  goalId: ID
  // Called with the answered questions (blank answers dropped) when the user
  // submits. The panel does the async generation; the modal closes right after.
  onBuild: (intake: IntakeExchange[]) => void
}

type Phase = 'loading' | 'error' | 'ready'

const inputClass =
  'w-full rounded-app-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'
const secondaryBtn =
  'rounded-app-lg border border-app-border px-4 py-2 text-sm font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'
const primaryBtn =
  'rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'

export function StrategyIntakeModal({
  open,
  onClose,
  goalId,
  onBuild,
}: StrategyIntakeModalProps) {
  // `attempt` remounts the body to re-run its mount-time question fetch on Retry.
  const [attempt, setAttempt] = useState(0)

  return (
    <Modal isOpen={open} onClose={onClose} title="Get your bearings">
      {open ? (
        <StrategyIntakeBody
          key={attempt}
          goalId={goalId}
          onRetry={() => setAttempt((a) => a + 1)}
          onClose={onClose}
          onBuild={onBuild}
        />
      ) : null}
    </Modal>
  )
}

interface StrategyIntakeBodyProps {
  goalId: ID
  onRetry: () => void
  onClose: () => void
  onBuild: (intake: IntakeExchange[]) => void
}

function StrategyIntakeBody({
  goalId,
  onRetry,
  onClose,
  onBuild,
}: StrategyIntakeBodyProps) {
  const generateIntakeQuestions = useGoalStore((s) => s.generateIntakeQuestions)

  const [phase, setPhase] = useState<Phase>('loading')
  const [questions, setQuestions] = useState<string[]>([])
  const [answers, setAnswers] = useState<string[]>([])

  // Fetch the questions once on mount (the wrapper remounts this body on open and
  // on Retry, so this single mount-time fetch covers both).
  useEffect(() => {
    let active = true
    generateIntakeQuestions(goalId)
      .then((qs) => {
        if (!active) return
        setQuestions(qs)
        setAnswers(qs.map(() => ''))
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

  // Hand the answered questions up and close. Blank answers are dropped; with none,
  // the panel still generates a brief from the standing context (the "skip" path).
  function submit() {
    const intake: IntakeExchange[] = questions
      .map((question, i) => ({ question, answer: answers[i].trim() }))
      .filter((ex) => ex.answer.length > 0)
    onBuild(intake)
    onClose()
  }

  if (phase === 'loading') {
    return (
      <p className="mt-6 mb-2 animate-pulse text-sm text-app-text-muted">
        Thinking of the right questions to ask…
      </p>
    )
  }

  if (phase === 'error') {
    return (
      <div className="mt-5">
        <p className="text-sm text-app-text-muted">
          Could not prepare questions just now. You can try again, or build a brief
          from what LifeMap already knows about you.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onRetry} className={secondaryBtn}>
            Try again
          </button>
          <button type="button" onClick={submit} className={primaryBtn}>
            Build from what you know
          </button>
        </div>
      </div>
    )
  }

  // ready
  return (
    <div className="mt-4">
      {questions.length > 0 ? (
        <>
          <p className="mb-4 text-sm text-app-text-muted">
            Answer what you can — the more you share, the sharper the plan. Blank
            answers are fine.
          </p>
          <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
            {questions.map((question, index) => (
              <div key={index}>
                <label className="block text-sm font-medium text-app-text">
                  {question}
                </label>
                <textarea
                  value={answers[index] ?? ''}
                  onChange={(e) =>
                    setAnswers((prev) =>
                      prev.map((a, i) => (i === index ? e.target.value : a)),
                    )
                  }
                  rows={2}
                  placeholder="Your answer (optional)"
                  className={`mt-1.5 ${inputClass} resize-none`}
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="mb-4 text-sm text-app-text-muted">
          No questions this time — go ahead and build a brief from what LifeMap
          already knows about you.
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onClose} className={secondaryBtn}>
          Cancel
        </button>
        <button type="button" onClick={submit} className={primaryBtn}>
          Build my strategy brief
        </button>
      </div>
    </div>
  )
}
