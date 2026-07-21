// GoalCard — presentation of a single Goal in the goals list, plus a delete
// affordance.
//
// WHY it lives in components/cards and stays thin: it holds no business logic —
// no fetching, no progress/health calculation (those are engine concerns in
// later phases). It renders what it is given, links to the goal's detail page,
// and offers a guarded delete. Local confirm/deleting flags are transient UI
// state, which belongs in the component, not the store.
//
// WHY the delete button is a sibling of the Link, not inside it: a <button>
// nested in an <a> is invalid HTML and clicking it would also trigger the link's
// navigation. So the card is a container; the Link is the main clickable area
// and the delete control sits on top of it.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Trash2 } from 'lucide-react'
import type { Goal } from '@/core/types'
import { goalDetailPath, GOAL_CATEGORY_OPTIONS } from '@/core/constants'
import { useGoalStore } from '@/store/useGoalStore'
import { GoalHealthBadge } from '@/components/cards/GoalHealthBadge'

interface GoalCardProps {
  goal: Goal
  // Position in the register, used only for the printed reference code.
  index?: number
}

// Look up the display label for a category; fall back to the raw value so a
// category added later still renders something sensible.
function categoryLabel(value: Goal['category']): string {
  return GOAL_CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? value
}

// Risk level → its status dot + label (same calm dot vocabulary as the pace badge).
const RISK_DOT = {
  low: 'bg-emerald-600',
  medium: 'bg-amber-600',
  high: 'bg-red-600',
} as const
const RISK_LABEL = { low: 'Low', medium: 'Medium', high: 'High' } as const
// Insight tone → text colour. Calm: a caution is amber, a warning red, praise muted.
const INSIGHT_TONE = {
  positive: 'text-app-text-muted',
  caution: 'text-amber-600',
  warning: 'text-red-600',
} as const

export function GoalCard({ goal, index }: GoalCardProps) {
  const setSelectedGoalId = useGoalStore((s) => s.setSelectedGoalId)
  const removeGoal = useGoalStore((s) => s.removeGoal)
  // Engine-computed momentum for this goal (the store builds it on load). May be
  // absent for a brand-new goal until the next list refresh; treated as no ring.
  const progress = useGoalStore((s) => s.goalProgress[goal.id])
  // A goal with no tasks has no momentum to show — keep the card calm, no ring.
  const showRing = progress !== undefined && progress.total > 0
  // Engine-computed health (same load pass as progress). Carries TWO separate
  // signals: pace (status/score) and the dependency "lagging foundation" note.
  // Pace is hidden for a goal with no tasks ('no_tasks').
  const health = useGoalStore((s) => s.goalHealth[goal.id])
  // The dependency note is meaningless for a finished goal (a completed/archived
  // goal isn't waiting on any foundation), so it follows the same gating as the
  // pace badge below.
  const isFinished = goal.status === 'completed' || goal.status === 'archived'

  // Two-step delete: idle -> confirming -> (delete | cancel). The confirm step
  // matters because deletion is destructive and there is no undo.
  const [confirming, setConfirming] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete() {
    setIsDeleting(true)
    try {
      await removeGoal(goal.id)
      // No reset needed on success: removing the goal unmounts this card.
    } catch {
      // On failure, return the card to a usable state so the user can retry.
      setIsDeleting(false)
      setConfirming(false)
    }
  }

  const ref = index != null ? String(index + 1).padStart(3, '0') : null

  return (
    <div className="group relative border border-app-border bg-app-surface transition-colors duration-200 hover:border-app-text/40 focus-within:border-app-text/40">
      <Link
        to={goalDetailPath(goal.id)}
        onClick={() => setSelectedGoalId(goal.id)}
        className="block p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-app-text-muted">
            {ref ? `Ref. ${ref}` : categoryLabel(goal.category)}
          </span>
          <div className="flex shrink-0 items-center gap-3">
            {/* Pace health is meaningless for a finished goal — a completed or
                archived goal is done, not "on track" — so the badge is hidden
                for those (and for goals with no tasks to assess). */}
            {health && health.status !== 'no_tasks' && !isFinished ? (
              <GoalHealthBadge status={health.status} />
            ) : null}
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-app-text-muted">
              {categoryLabel(goal.category)}
            </span>
          </div>
        </div>

        <h3 className="mt-3 font-display text-lg font-semibold leading-snug text-app-text">
          {goal.title}
        </h3>

        {goal.description ? (
          <p className="mt-1.5 line-clamp-2 text-sm text-app-text-muted">
            {goal.description}
          </p>
        ) : null}

        {/* Dependency health signal — SEPARATE from the pace badge and explained
            on its own line: a foundation subgoal is trailing the work that leans
            on it. A calm amber nudge (not a red siren), hidden for finished goals.
            Sits above the date row so it never overlaps the delete control. */}
        {health?.laggingFoundation && !isFinished ? (
          <p className="mt-3 text-xs text-amber-600">
            Foundation lagging: {health.laggingFoundation.foundationTitle} is
            trailing {health.laggingFoundation.dependentTitle}, which builds on
            it.
          </p>
        ) : null}

        {/* "Delayed, and by how much" — the projected finish at the current pace
            and how far it overshoots the target. Shown only when the pace badge is
            already at_risk/behind (so the two never contradict). A hard deadline is
            phrased as "speed up" (its date can't move); a soft one is informational. */}
        {health &&
        !isFinished &&
        (health.status === 'at_risk' || health.status === 'behind') &&
        health.projection.daysBehind > 0 &&
        health.projection.projectedDate ? (
          <p
            className={`mt-3 text-xs ${
              health.deadlineHardness === 'hard'
                ? 'text-red-600'
                : 'text-amber-600'
            }`}
          >
            {health.deadlineHardness === 'hard'
              ? `Hard deadline — about ${health.projection.daysBehind} days behind. At this pace you'll finish ${format(
                  parseISO(health.projection.projectedDate),
                  'd MMM yyyy',
                )}; increase your pace to hit the target.`
              : `About ${health.projection.daysBehind} days behind — at this pace you'll finish ${format(
                  parseISO(health.projection.projectedDate),
                  'd MMM yyyy',
                )}.`}
          </p>
        ) : null}

        {/* Momentum as a printed rule: an ink fill over a hairline track, with a
            mono percent. Hidden for a goal with no tasks. */}
        {showRing ? (
          <div className="mt-4">
            <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-app-text-muted">
              <span>Progress</span>
              <span
                className="tabular-nums text-app-text"
                aria-label={`${progress.completed} of ${progress.total} tasks complete`}
              >
                {progress.percent}%
              </span>
            </div>
            <div className="mt-1.5 h-[3px] w-full bg-app-border">
              <div className="h-[3px] bg-app-text" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        ) : null}

        {/* Reliability — the SEPARATE "how well have I kept my plans" signal, paired
            with Progress as a second ruled bar. Shown once there's history to judge
            (a completed or missed task) and hidden for finished goals, mirroring the
            pace badge. A reschedule / late finish / open miss dents it durably; it
            recovers with recent consistency (see computeReliability). */}
        {health && health.reliability.status !== 'no_history' && !isFinished ? (
          <div className="mt-2">
            <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-app-text-muted">
              <span>Reliability</span>
              <span className="tabular-nums text-app-text">
                {health.reliability.score}%
              </span>
            </div>
            <div className="mt-1.5 h-[3px] w-full bg-app-border">
              <div
                className="h-[3px] bg-app-text"
                style={{ width: `${health.reliability.score}%` }}
              />
            </div>
          </div>
        ) : null}

        {/* Risk — the blended Low/Med/High top-line, as a labelled dot (same calm
            vocabulary as the pace badge). Gated like the other signals. */}
        {health && health.status !== 'no_tasks' && !isFinished ? (
          <div className="mt-2 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-app-text-muted">
            <span>Risk</span>
            <span className="inline-flex items-center gap-1.5 text-app-text">
              <span
                className={`h-1.5 w-1.5 rounded-full ${RISK_DOT[health.risk.level]}`}
                aria-hidden
              />
              {RISK_LABEL[health.risk.level]}
            </span>
          </div>
        ) : null}

        {/* Interpretation — the single most-important plain-language read of the
            signals (Stage 2). A sentence, not a siren; toned by severity. */}
        {health && !isFinished && health.insights.length > 0 ? (
          <p className={`mt-3 text-xs ${INSIGHT_TONE[health.insights[0].tone]}`}>
            {health.insights[0].text}
          </p>
        ) : null}

        {/* Right padding leaves room for the delete control. */}
        <div className="mt-4 pr-20 font-mono text-[10px] uppercase tracking-[0.14em] text-app-text-muted">
          Target {format(parseISO(goal.targetDate), 'd MMM yyyy')}
        </div>
      </Link>

      {/* Delete control — sibling of the Link. Hidden until hover or keyboard
          focus to keep the card calm by default (desktop-first per the strategy;
          a mobile-friendly affordance comes with the mobile pass). */}
      <div className="absolute bottom-3 right-3">
        {confirming ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-red-600 transition hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:opacity-50"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={isDeleting}
              className="px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-app-text-muted transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Delete goal: ${goal.title}`}
            className="p-1.5 text-app-text-muted transition hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30 can-hover:opacity-0 can-hover:focus-visible:opacity-100 can-hover:group-hover:opacity-100"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  )
}