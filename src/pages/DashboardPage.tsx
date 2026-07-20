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

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { useGoalStore } from '@/store/useGoalStore'
import { useLifeMap } from '@/core/hooks/useLifeMap'
import { useProfile } from '@/core/hooks/useProfile'
import { ROUTES } from '@/core/constants'
import { useColophon } from '@/core/hooks/useColophon'
import { dailyQuote } from '@/core/utils/dailyQuote'
import { RegistrySection, LeaderRow } from '@/components/ui/Registry'
import { FocusLedger } from '@/features/dashboard/registry/FocusLedger'

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
  const toggleTaskComplete = useGoalStore((s) => s.toggleTaskComplete)
  const rescheduleAllOverdue = useGoalStore((s) => s.rescheduleAllOverdue)
  const loadDashboard = useGoalStore((s) => s.loadDashboard)

  // Cross-goal "catch up": pull every goal's missed work forward under one shared
  // daily budget. The store refreshes overdueTasks, so a success empties it and the
  // notice unmounts itself; only a failure surfaces a note.
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [rescheduleNote, setRescheduleNote] = useState<string | null>(null)
  async function handleRescheduleAll() {
    if (isRescheduling) return
    setIsRescheduling(true)
    setRescheduleNote(null)
    try {
      await rescheduleAllOverdue()
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
  const overallPercent = cities.length
    ? Math.round(cities.reduce((sum, c) => sum + c.percent, 0) / cities.length)
    : 0

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
  // One deterministic "field note" per day (rotates without repeats; see dailyQuote).
  const [quoteText, quoteAuthor] = dailyQuote(now)
  const name = profile?.name?.trim()
  const hasMap = !!lifeMap && lifeMap.nodes.length > 0

  if (!hasMap) {
    return <EmptyOrLoading isLoading={isLoading} onStart={() => navigate(ROUTES.GOALS)} />
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* ── Masthead ─────────────────────────────────────────────────────── */}
      <header className="flex items-end justify-between gap-6 border-b-2 border-app-rule pb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-app-text-muted">
            LifeMap — Daily Log{name ? ` · ${greeting(now)}, ${name}` : ''}
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold leading-none tracking-tight text-app-text">
            {format(now, 'EEEE')}
          </h1>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-app-text-muted">
            Registry of active intentions · {format(now, 'd LLLL yyyy')}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-4xl font-semibold leading-none tracking-tight text-app-text">
            {overallPercent}%
          </div>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-app-text-muted">
            Total realization
          </p>
        </div>
      </header>

      {/* ── Body: focus ledger + right rail ──────────────────────────────── */}
      <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <RegistrySection
            title="Today's Focus"
            meta={focusIsToday ? `${focusTasks.length} scheduled` : 'By priority'}
          >
            <FocusLedger tasks={focusTasks} onToggle={toggleTaskComplete} />
          </RegistrySection>
        </div>

        <div className="space-y-8 lg:col-span-5">
          <RegistrySection title="Upcoming" meta="Deadlines" weight="hair">
            {upcoming.length === 0 ? (
              <p className="py-1 font-mono text-[12px] uppercase tracking-[0.14em] text-app-text-muted">
                Nothing on the horizon.
              </p>
            ) : (
              <div>
                {upcoming.slice(0, 5).map((u) => (
                  <LeaderRow key={u.id} label={u.label} value={format(new Date(u.date), 'd LLL yyyy')} />
                ))}
              </div>
            )}
          </RegistrySection>

          <RegistrySection title="Realization" meta="Tally" weight="hair">
            <LeaderRow label="Goals" value={cities.length} />
            <LeaderRow label="Subgoals" value={townCount} />
            <LeaderRow label="Total" value={`${overallPercent}%`} emphasize />
          </RegistrySection>

          {overdueTasks.length > 0 && (
            <RegistrySection title="Overdue" meta="Lapsed" weight="hair">
              <p className="text-[13px] text-app-text">
                <span className="font-mono font-semibold tabular-nums">{overdueTasks.length}</span>{' '}
                {overdueTasks.length === 1 ? 'entry has' : 'entries have'} lapsed across your goals.
              </p>
              <button
                type="button"
                onClick={handleRescheduleAll}
                disabled={isRescheduling}
                className="mt-3 w-full bg-app-text px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-app-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
              >
                {isRescheduling ? 'Rescheduling…' : 'Reschedule onto upcoming days'}
              </button>
              {rescheduleNote && (
                <p className="mt-2 text-[11px] text-app-text-muted">{rescheduleNote}</p>
              )}
            </RegistrySection>
          )}

          {/* Field Note — the daily epigraph, set as a printed marginal note. */}
          <RegistrySection title="Field Note" meta={format(now, 'EEE · d LLL')} weight="hair">
            <blockquote className="font-display text-[15px] italic leading-snug text-app-text">
              “{quoteText}”
            </blockquote>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-app-text-muted">
              — {quoteAuthor}
            </p>
          </RegistrySection>
        </div>
      </div>

      {/* ── Colophon foot ────────────────────────────────────────────────── */}
      <footer className="mt-10 flex items-center justify-between border-t border-app-border pt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-app-text-muted">
        <span>Last revision {format(now, 'yyyy.MM.dd')}</span>
        <span>LifeMap · {colophon}</span>
      </footer>
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
