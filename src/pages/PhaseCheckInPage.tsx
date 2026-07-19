// Phase-end check-in (Phase 10) — a guided, one-question-per-screen flow the user
// walks when a phase (MILESTONE) is complete. Three beats, per the agreed design:
//   1. What you did this phase   — REAL, from the store's phaseCheckIns recap.
//   2. Anything changed?         — a light re-intake: the note is folded back into
//                                   the DIRECTION (applyCheckInChange regenerates the
//                                   Strategy Brief with it), so the next phase — and
//                                   every later generation that reads the brief —
//                                   accounts for it.
//   3. Preview & expand next phase — REAL: previews the NEXT milestone in the same
//                                   track and expands it into ~2 weeks of dated
//                                   tasks on approval (reuses generatePhaseTasks).
//
// Thin route-level page: it reads the assembled tree + per-phase recap the store
// already holds (via useGoalTree, which loads them) and owns only local step state.
// No DB access, no recap math here — computePhaseCheckIn did that in the engine.

import { type ReactNode, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Sparkles, PartyPopper } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ROUTES, goalDetailPath } from '@/core/constants'
import { useGoalTree } from '@/core/hooks/useGoalTree'
import { useGoalStore } from '@/store/useGoalStore'
import type { PhaseCheckInData } from '@/engine/review/computePhaseCheckIn'
import { ProgressRing } from '@/components/progress/ProgressRing'

const TOTAL_STEPS = 3

// The next phase within a track: the milestone that follows the one being checked
// in (by order). Undefined when this was the track's last phase.
interface NextPhase {
  id: string
  title: string
  description?: string
}

// A human span for the phase's dated window. Null bounds (an undated phase) yield
// null so the caller shows its own fallback; a single-day phase reads as one date.
function formatSpan(start: string | null, end: string | null): string | null {
  if (!start || !end) return null
  const from = format(parseISO(start), 'd MMM')
  const to = format(parseISO(end), 'd MMM')
  return from === to ? from : `${from} – ${to}`
}

export function PhaseCheckInPage() {
  const { goalId = '', milestoneId = '' } = useParams<{
    goalId: string
    milestoneId: string
  }>()
  const navigate = useNavigate()
  const { tree, isLoading } = useGoalTree(goalId)
  const checkIn = useGoalStore((s) => s.phaseCheckIns[milestoneId])
  const generatePhaseTasks = useGoalStore((s) => s.generatePhaseTasks)
  const applyCheckInChange = useGoalStore((s) => s.applyCheckInChange)

  // 0-indexed beat. Beat 2's free-text answer is captured here and, on leaving the
  // beat, folded into the goal's Direction (see handleAdvanceFromChange).
  const [step, setStep] = useState(0)
  const [changeNote, setChangeNote] = useState('')
  // Beat 2 — folding the "anything changed?" note into the brief. `changeApplied`
  // guards against re-submitting the same note if the user steps back and forth;
  // editing the note clears it so an edited note is re-applied.
  const [isApplyingChange, setIsApplyingChange] = useState(false)
  const [changeApplied, setChangeApplied] = useState(false)
  const [changeError, setChangeError] = useState<string | null>(null)
  // Beat 3 — expanding the next phase into dated tasks.
  const [isPlanning, setIsPlanning] = useState(false)
  const [plannedCount, setPlannedCount] = useState<number | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)

  if (isLoading && !tree) {
    return (
      <Shell goalId={goalId}>
        <CenteredNote>Loading your phase…</CenteredNote>
      </Shell>
    )
  }

  // Locate the phase (milestone) within its track and name the phase that follows
  // it (next by order in the SAME subgoal) — that is what beat 3 expands.
  let found = false
  let nextPhase: NextPhase | undefined
  for (const st of tree?.subgoals ?? []) {
    const ordered = [...st.milestones].sort(
      (a, b) => a.milestone.order - b.milestone.order,
    )
    const idx = ordered.findIndex((mt) => mt.milestone.id === milestoneId)
    if (idx >= 0) {
      found = true
      const nm = ordered[idx + 1]?.milestone
      if (nm) nextPhase = { id: nm.id, title: nm.title, description: nm.description }
      break
    }
  }

  if (!tree || !found || !checkIn) {
    return (
      <Shell goalId={goalId}>
        <CenteredNote>
          This phase could not be found. It may have been deleted.
        </CenteredNote>
      </Shell>
    )
  }

  const finish = () => navigate(goalDetailPath(goalId))
  const back = () => setStep((s) => Math.max(0, s - 1))
  const next = () => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1))

  // Editing the note after it was applied re-arms it, so an updated note is folded
  // in again on the next advance.
  const onChangeNote = (v: string) => {
    setChangeNote(v)
    setChangeApplied(false)
    setChangeError(null)
  }

  // Leaving beat 2: fold a non-empty, not-yet-applied note into the Direction BEFORE
  // advancing, so beat 3 plans the next phase against the refreshed brief. The await
  // guarantees that ordering. A failure is non-blocking — it surfaces a note and the
  // user still moves on (the note isn't lost; they can retry by editing + advancing).
  async function handleAdvanceFromChange() {
    const note = changeNote.trim()
    if (note.length === 0 || changeApplied) {
      next()
      return
    }
    setIsApplyingChange(true)
    setChangeError(null)
    try {
      await applyCheckInChange(goalId, note)
      setChangeApplied(true)
      next()
    } catch {
      setChangeError(
        'Could not update your direction just now — you can still continue.',
      )
    } finally {
      setIsApplyingChange(false)
    }
  }

  async function handlePlanNext() {
    if (isPlanning || !nextPhase) return
    setIsPlanning(true)
    setPlanError(null)
    try {
      const count = await generatePhaseTasks(nextPhase.id)
      setPlannedCount(count)
    } catch {
      setPlanError('Could not plan the next phase just now. Please try again.')
    } finally {
      setIsPlanning(false)
    }
  }

  return (
    <Shell goalId={goalId}>
      <StepIndicator step={step} />

      <div className="mt-6 rounded-app-lg border border-app-border bg-app-surface p-6">
        {step === 0 ? (
          <RecapBeat checkIn={checkIn} />
        ) : step === 1 ? (
          <ChangedBeat
            value={changeNote}
            onChange={onChangeNote}
            isApplying={isApplyingChange}
            applied={changeApplied}
            error={changeError}
          />
        ) : (
          <NextPhaseBeat
            nextPhase={nextPhase}
            isPlanning={isPlanning}
            plannedCount={plannedCount}
            planError={planError}
            onPlan={handlePlanNext}
          />
        )}
      </div>

      {/* Footer nav: Back is hidden on the first beat; the primary advances, and on
          the last beat it finishes the check-in. */}
      <div className="mt-4 flex items-center justify-between">
        {step > 0 ? (
          <button
            type="button"
            onClick={back}
            className="rounded-app-lg px-3 py-1.5 text-sm text-app-text-muted transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          >
            Back
          </button>
        ) : (
          <span />
        )}

        {step < TOTAL_STEPS - 1 ? (
          <button
            type="button"
            onClick={step === 1 ? handleAdvanceFromChange : next}
            disabled={isApplyingChange}
            className="inline-flex items-center gap-2 rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          >
            {step === 1
              ? isApplyingChange
                ? 'Updating your plan…'
                : changeNote.trim().length === 0
                  ? "Nothing's changed"
                  : changeApplied
                    ? 'Next'
                    : 'Update & continue'
              : 'Next'}
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            className="inline-flex items-center gap-2 rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          >
            <Check size={16} />
            Done
          </button>
        )}
      </div>
    </Shell>
  )
}

// Beat 1 — the real recap. Effort ring + counts + the span, then what got done.
function RecapBeat({ checkIn }: { checkIn: PhaseCheckInData }) {
  const span = formatSpan(checkIn.spanStart, checkIn.spanEnd)
  return (
    <div>
      <div className="flex items-center gap-2 text-app-text-muted">
        <PartyPopper size={16} aria-hidden />
        <span className="text-xs font-medium uppercase tracking-wide">
          Phase complete
        </span>
      </div>
      <h2 className="mt-2 text-xl font-semibold text-app-text">
        {checkIn.phaseTitle}
      </h2>
      <p className="mt-1 text-sm text-app-text-muted">What you did this phase</p>

      <div className="mt-5 flex items-center gap-4">
        <ProgressRing
          percent={checkIn.completion.percent}
          size={56}
          strokeWidth={6}
          ariaLabel={`${checkIn.completion.percent}% of the effort done`}
        />
        <div className="text-sm text-app-text">
          <p className="font-medium">
            {checkIn.completedTasks.length} of {checkIn.totalTasks} tasks done
          </p>
          {span ? (
            <p className="text-app-text-muted">{span}</p>
          ) : (
            <p className="text-app-text-muted">No dated work in this phase</p>
          )}
        </div>
      </div>

      {checkIn.completedTasks.length > 0 ? (
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-app-text-muted">
            You finished
          </p>
          <ul className="mt-2 space-y-1">
            {checkIn.completedTasks.map((t) => (
              <li
                key={t.id}
                className="flex items-start gap-2 text-sm text-app-text"
              >
                <Check
                  size={14}
                  className="mt-0.5 shrink-0 text-app-text-muted"
                  aria-hidden
                />
                {t.title}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Outstanding work is named, not hidden — but framed forward-looking. */}
      {checkIn.outstandingTasks.length > 0 ? (
        <p className="mt-4 text-xs text-app-text-muted">
          {checkIn.outstandingTasks.length} task
          {checkIn.outstandingTasks.length === 1 ? '' : 's'} still open — they
          carry forward, nothing is lost.
        </p>
      ) : null}
    </div>
  )
}

// Beat 2 — light re-intake. The note is folded into the goal's Direction when the
// user leaves this beat (see handleAdvanceFromChange), so the next phase accounts
// for it; the status line reflects what's happening.
function ChangedBeat({
  value,
  onChange,
  isApplying,
  applied,
  error,
}: {
  value: string
  onChange: (v: string) => void
  isApplying: boolean
  applied: boolean
  error: string | null
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-app-text">Anything changed?</h2>
      <p className="mt-1 text-sm text-app-text-muted">
        Shifting priorities, new constraints, a change of pace — jot it down and
        it&rsquo;s folded into your plan so the next phase accounts for it. Leave it
        blank if all&rsquo;s steady.
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="e.g. I have more time on weekends now…"
        className="mt-4 w-full rounded-app-lg border border-app-border bg-app-surface-alt px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
      />
      {isApplying ? (
        <p className="mt-2 animate-pulse text-xs text-app-text-muted">
          Folding this into your direction…
        </p>
      ) : applied ? (
        <p className="mt-2 text-xs text-app-text-muted">
          Updated your direction — the next phase will account for it.
        </p>
      ) : error ? (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      ) : (
        <p className="mt-2 text-xs text-app-text-muted">
          Applied when you continue — it reshapes the direction, not this recap.
        </p>
      )}
    </div>
  )
}

// Beat 3 — preview the next phase and expand it into dated tasks on approval.
function NextPhaseBeat({
  nextPhase,
  isPlanning,
  plannedCount,
  planError,
  onPlan,
}: {
  nextPhase: NextPhase | undefined
  isPlanning: boolean
  plannedCount: number | null
  planError: string | null
  onPlan: () => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-app-text-muted">
        <Sparkles size={16} aria-hidden />
        <span className="text-xs font-medium uppercase tracking-wide">
          Up next
        </span>
      </div>
      {nextPhase ? (
        <>
          <h2 className="mt-2 text-xl font-semibold text-app-text">
            {nextPhase.title}
          </h2>
          {nextPhase.description ? (
            <p className="mt-2 text-sm text-app-text-muted">
              {nextPhase.description}
            </p>
          ) : null}

          {plannedCount === null ? (
            <>
              <p className="mt-4 text-sm text-app-text-muted">
                Expand this phase into a couple of weeks of dated tasks now?
              </p>
              <button
                type="button"
                onClick={onPlan}
                disabled={isPlanning}
                className="mt-3 inline-flex items-center gap-2 rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
              >
                <Sparkles size={15} />
                {isPlanning ? 'Planning this phase…' : 'Plan the next phase'}
              </button>
              {planError ? (
                <p className="mt-2 text-xs text-red-600">{planError}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-4 rounded-app-lg border border-app-border bg-app-surface-alt px-3 py-2 text-sm text-app-text">
              {plannedCount > 0
                ? `Planned ${plannedCount} task${plannedCount === 1 ? '' : 's'} for this phase — you'll find them on the goal.`
                : 'This phase already reaches the deadline, so nothing new was added.'}
            </p>
          )}
        </>
      ) : (
        <>
          <h2 className="mt-2 text-xl font-semibold text-app-text">
            That was the last phase of this track.
          </h2>
          <p className="mt-2 text-sm text-app-text-muted">
            No further phase is defined here yet — add one from the goal page when
            you&rsquo;re ready to keep going.
          </p>
        </>
      )}
    </div>
  )
}

// The step dots + "Step X of 3" label.
function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-app-text-muted">
        Step {step + 1} of {TOTAL_STEPS}
      </span>
      <div className="flex items-center gap-1.5" aria-hidden>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full ${
              i <= step ? 'bg-app-text' : 'bg-app-border'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

// Page frame: a back link to the goal + a constrained column, shared by every state.
function Shell({
  goalId,
  children,
}: {
  goalId: string
  children: ReactNode
}) {
  return (
    <section className="mx-auto max-w-2xl">
      <Link
        to={goalId ? goalDetailPath(goalId) : ROUTES.GOALS}
        className="inline-flex items-center gap-1.5 rounded text-sm text-app-text-muted transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
      >
        <ArrowLeft size={16} />
        Back to goal
      </Link>
      {children}
    </section>
  )
}

function CenteredNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 rounded-app-lg border border-app-border bg-app-surface p-10 text-center text-sm text-app-text-muted">
      {children}
    </div>
  )
}
