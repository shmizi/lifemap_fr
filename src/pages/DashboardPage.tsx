// Dashboard page — EDITORIAL REGISTRY "Daily Log".
//
// This screen answers ONE question: "what should I do today?" (the one-question
// principle). It reads like a dated page of a printed index — a masthead with the
// day's total realization, a numbered TODAY'S FOCUS ledger as the hero, and a
// right rail of readouts (Upcoming deadlines, Realization tallies, an Overdue
// notice). No living map, no floating glass panels, no persona voice.
//
// The living-map components (features/dashboard/livingmap/*) are intentionally
// left in place, unused here — they are slated to become the Roadmap screen's
// dependency plate. The page still owns the two data loads and holds no business
// logic: the store assembles, these presentational pieces render.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { useGoalStore } from '@/store/useGoalStore'
import { useLifeMap } from '@/core/hooks/useLifeMap'
import { useProfile } from '@/core/hooks/useProfile'
import { ROUTES } from '@/core/constants'
import { useColophon } from '@/core/hooks/useColophon'
import { LeaderRow } from '@/components/ui/Registry'
import { FocusLedger } from '@/features/dashboard/registry/FocusLedger'
import { SlipReasonModal } from '@/features/health/SlipReasonModal'
import type { SlipReason } from '@/core/types'

function greeting(d: Date): string {
  const h = d.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { lifeMap, isLoading } = useLifeMap()
  const { profile } = useProfile()
  const colophon = useColophon(profile?.createdAt)

  const todaysTasks = useGoalStore((s) => s.todaysTasks)
  const topPriorityTasks = useGoalStore((s) => s.topPriorityTasks)
  const overdueTasks = useGoalStore((s) => s.overdueTasks)
  const todayEffort = useGoalStore((s) => s.todayEffort)
  // Per-goal progress — the SAME source the goal cards use, and (unlike lifeMap) it
  // is refreshed on every task mutation, so the headline figure below updates live
  // the moment a task is ticked.
  const goalProgress = useGoalStore((s) => s.goalProgress)
  const toggleTaskComplete = useGoalStore((s) => s.toggleTaskComplete)
  const rescheduleAllOverdue = useGoalStore((s) => s.rescheduleAllOverdue)
  const loadDashboard = useGoalStore((s) => s.loadDashboard)

  // Cross-goal "catch up": pull every goal's missed work forward under one shared
  // daily budget. The store refreshes overdueTasks, so a success empties it and the
  // notice unmounts itself; only a failure surfaces a note.
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [rescheduleNote, setRescheduleNote] = useState<string | null>(null)
  // Stage 3: the reschedule now asks WHY first (the reason feeds the pattern engine).
  const [reasonOpen, setReasonOpen] = useState(false)
  async function handleRescheduleAll(reason: SlipReason) {
    if (isRescheduling) return
    setIsRescheduling(true)
    setRescheduleNote(null)
    try {
      await rescheduleAllOverdue(reason)
      setReasonOpen(false)
    } catch {
      setRescheduleNote('Could not reschedule just now. Please try again.')
    } finally {
      setIsRescheduling(false)
    }
  }

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const cities = useMemo(
    () => (lifeMap?.nodes ?? []).filter((n) => n.kind === 'city'),
    [lifeMap],
  )
  const townCount = (lifeMap?.nodes.length ?? 0) - cities.length
  // Total realization = mean completion across all goals, read from the live
  // goalProgress map (not the lifeMap cities, which only rebuild on a full reload).
  const overallPercent = useMemo(() => {
    const entries = Object.values(goalProgress)
    if (entries.length === 0) return 0
    return Math.round(
      entries.reduce((sum, p) => sum + p.percent, 0) / entries.length,
    )
  }, [goalProgress])

  // Flash the figure whenever it changes (a tick recomputes it). Bumping a key
  // remounts the span so the CSS animation re-fires on every change; the first
  // render is skipped (ref starts null) so it doesn't flash before any interaction.
  const [pulseKey, setPulseKey] = useState(0)
  const prevPercentRef = useRef<number | null>(null)
  useEffect(() => {
    if (
      prevPercentRef.current !== null &&
      prevPercentRef.current !== overallPercent
    ) {
      setPulseKey((k) => k + 1)
    }
    prevPercentRef.current = overallPercent
  }, [overallPercent])

  // Today first; fall back to the cross-goal priority list when nothing's planned.
  const focusTasks = todaysTasks.length > 0 ? todaysTasks : topPriorityTasks
  const focusIsToday = todaysTasks.length > 0

  // Nearest still-open goals with a deadline, soonest first.
  const upcoming = useMemo(() => {
    if (!lifeMap) return []
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return lifeMap.nodes
      .filter((n) => n.date && n.state !== 'done' && new Date(n.date) >= start)
      .map((n) => ({ id: n.id, label: n.label, date: n.date as string }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [lifeMap])

  const now = new Date()
  const name = profile?.name?.trim()
  const hasMap = !!lifeMap && lifeMap.nodes.length > 0

  if (!hasMap) {
    return <EmptyOrLoading isLoading={isLoading} onStart={() => navigate(ROUTES.GOALS)} />
  }

  // Row-2 index cards: the nearest deadlines, with an inverted "lapsed" card taking
  // the first slot when work has slipped (so the overdue nudge reads as an accent).
  const deadlineCards = upcoming.slice(0, overdueTasks.length > 0 ? 2 : 3)

  return (
    // A single fixed screen (the shell bounds the height; overflow-hidden means the
    // page never scrolls). Everything is set as bordered index cards — a printed
    // register, not flat rules — so the day "pops" off the sheet.
    <div className="mx-auto flex w-full min-h-0 max-w-5xl flex-1 flex-col overflow-hidden">
      {/* ── Masthead — ruled top and bottom, like a printed index head ─────── */}
      <header className="shrink-0 border-t-2 border-app-rule pt-4">
        <div className="flex items-end justify-between gap-6 border-b-2 border-app-rule pb-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-app-text-muted">
              LifeMap Index{name ? ` · ${greeting(now)}, ${name}` : ''}
            </p>
            <h1 className="mt-2 font-display text-[2.6rem] font-semibold leading-none tracking-tight text-app-text">
              {format(now, 'EEEE')}
            </h1>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-app-text-muted">
              Registry of active &amp; latent intentions · {format(now, 'd LLLL yyyy')}
            </p>
          </div>
          {/* pr gives the italic “%” (which leans right) and the sweep highlight room
              so neither is clipped by the masthead's overflow-hidden edge; leading is
              relaxed so the tall figure isn't clipped at the top either. */}
          <div className="shrink-0 pr-[0.32em] text-right">
            <div className="font-display text-[2.6rem] font-semibold italic leading-[1.22] tracking-tight text-app-text">
              <span
                key={pulseKey}
                className={`inline-block ${pulseKey > 0 ? 'animate-realization-flash' : ''}`}
              >
                {overallPercent}%
              </span>
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-app-text-muted">
              Total realization
            </p>
          </div>
        </div>
      </header>

      {/* ── Body — bordered index cards ──────────────────────────────────── */}
      <div className="mt-5 flex min-h-0 flex-1 flex-col gap-4">
        {/* Row 1 — hero focus box, split with a right-hand status plate. */}
        <section className="flex min-h-0 flex-1 border border-app-border bg-app-surface">
          <div className="flex min-w-0 flex-1 flex-col p-5">
            <div className="flex shrink-0 items-center justify-between">
              <span className="border border-app-text px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-app-text">
                {focusIsToday ? "Today's Focus" : 'Focus Queue'}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-app-text-muted">
                {focusIsToday ? `${focusTasks.length} scheduled` : 'By priority'}
              </span>
            </div>
            {/* Scrolls within the box (bar hidden) so a long day never grows the page. */}
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto scrollbar-hide">
              <FocusLedger tasks={focusTasks} onToggle={toggleTaskComplete} />
            </div>
          </div>

          {/* Status plate — a right sub-panel of readouts; hidden on narrow screens. */}
          <aside className="hidden w-[32%] shrink-0 flex-col border-l border-app-border bg-app-surface-alt p-5 lg:flex">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-app-text-muted">
              Status: Active
            </p>
            <div className="mt-4">
              <LeaderRow label="Scheduled" value={focusTasks.length} />
              <LeaderRow label="Effort" value={`${todayEffort.percent}%`} />
              <LeaderRow label="Realization" value={`${overallPercent}%`} emphasize />
            </div>
            <p className="mt-auto pt-4 font-mono text-[10px] leading-relaxed uppercase tracking-[0.1em] text-app-text-muted">
              {cities.length} {cities.length === 1 ? 'goal' : 'goals'} in motion ·{' '}
              {townCount} subgoals filed.{' '}
              {overdueTasks.length > 0 ? `${overdueTasks.length} lapsed.` : 'On pace.'}
            </p>
          </aside>
        </section>

        {/* Row 2 — deadline / overdue index cards. */}
        <div className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-3">
          {overdueTasks.length > 0 && (
            <div className="flex flex-col border border-app-text bg-app-text p-4 text-app-surface">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]">
                  Lapsed
                </span>
                <span className="bg-app-surface px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-app-text">
                  {overdueTasks.length}
                </span>
              </div>
              <p className="mt-2 font-display text-[15px] leading-snug">
                {overdueTasks.length}{' '}
                {overdueTasks.length === 1 ? 'entry has' : 'entries have'} slipped past.
              </p>
              <button
                type="button"
                onClick={() => setReasonOpen(true)}
                disabled={isRescheduling}
                className="mt-auto w-full bg-app-surface px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-app-text transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRescheduling ? 'Rescheduling…' : 'Reschedule'}
              </button>
              {rescheduleNote && (
                <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em]">
                  {rescheduleNote}
                </p>
              )}
            </div>
          )}

          {upcoming.length === 0 && overdueTasks.length === 0 ? (
            <div className="border border-app-border bg-app-surface p-4 sm:col-span-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-app-text-muted">
                Upcoming
              </span>
              <p className="mt-2 font-display text-[15px] italic text-app-text-muted">
                Nothing on the horizon.
              </p>
            </div>
          ) : (
            deadlineCards.map((u, i) => (
              <div
                key={u.id}
                className="flex flex-col border border-app-border bg-app-surface p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-app-text-muted">
                    Ref. {String(i + 1).padStart(3, '0')}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-app-text-muted">
                    Deadline
                  </span>
                </div>
                <h3 className="mt-2 line-clamp-2 font-display text-[17px] font-medium leading-tight text-app-text">
                  {u.label}
                </h3>
                <span className="mt-auto pt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-app-text-muted">
                  {format(new Date(u.date), 'd LLL yyyy')}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Footer — flavor note + revision/edition, a printed index foot ──── */}
      <footer className="mt-4 flex shrink-0 items-end justify-between gap-6 border-t border-app-border pt-3">
        <p className="max-w-sm font-mono text-[9px] leading-relaxed uppercase tracking-[0.12em] text-app-text-muted">
          All entries subject to revision as the day unfolds · today's focus is drawn
          from your active subgoals each morning
        </p>
        <div className="shrink-0 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-app-text-muted">
          <div>Last revision {format(now, 'yyyy.MM.dd')}</div>
          <div className="mt-1">LifeMap · {colophon}</div>
        </div>
      </footer>

      <SlipReasonModal
        isOpen={reasonOpen}
        onClose={() => setReasonOpen(false)}
        onSelect={handleRescheduleAll}
        isBusy={isRescheduling}
        count={overdueTasks.length}
      />
    </div>
  )
}

function EmptyOrLoading({ isLoading, onStart }: { isLoading: boolean; onStart: () => void }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-5xl flex-col items-center justify-center px-6 text-center">
      {isLoading ? (
        <p className="animate-pulse font-mono text-[12px] uppercase tracking-[0.16em] text-app-text-muted">
          Compiling the register…
        </p>
      ) : (
        <>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-app-text-muted">
            LifeMap — Daily Log
          </p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-app-text">
            The register is empty
          </h2>
          <p className="mt-2 max-w-sm text-sm text-app-text-muted">
            Record your first goal and it opens the index — subgoals file beneath it,
            and today's work is drawn from them each morning.
          </p>
          <button
            type="button"
            onClick={onStart}
            className="mt-5 bg-app-text px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-app-surface transition-opacity hover:opacity-90"
          >
            Record your first goal
          </button>
        </>
      )}
    </div>
  )
}
