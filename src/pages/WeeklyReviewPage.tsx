// Weekly Review — a calm, backward-looking summary of the past 7 days.
//
// Thin route-level page: it triggers the store's loadWeeklyReview on mount and
// renders the assembled view-model. No business logic, no DB access, no momentum
// math — the engine computes the window/completed/missed/daily-momentum live
// (ADR-0001, no snapshots) and the store assembles the per-goal grouping.
//
// TONE: the "still open" section is framed neutrally and forward-looking, never
// as failure — see the copy below. An empty week shows an encouraging line, not
// a blank gap.

import { useEffect, type ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { useGoalStore } from '@/store/useGoalStore'
import type { WeeklyReview } from '@/store/useGoalStore'

export function WeeklyReviewPage() {
  const weeklyReview = useGoalStore((s) => s.weeklyReview)
  const isLoading = useGoalStore((s) => s.isLoadingReview)
  const loadWeeklyReview = useGoalStore((s) => s.loadWeeklyReview)

  // Load on mount (this is the page that owns the review data, not the dashboard).
  useEffect(() => {
    void loadWeeklyReview()
  }, [loadWeeklyReview])

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-app-text">Weekly review</h1>
      <p className="mt-2 text-app-text-muted">
        {weeklyReview
          ? `Your week: ${formatDay(weeklyReview.windowStart)} – ${formatDay(
              weeklyReview.windowEnd,
            )}.`
          : 'The 7 days leading up to today.'}
      </p>

      <div className="mt-6 space-y-4">
        {isLoading && !weeklyReview ? (
          <Card>
            <p className="text-sm text-app-text-muted">Loading your week...</p>
          </Card>
        ) : !weeklyReview ? null : isEmptyWeek(weeklyReview) ? (
          <Card>
            <p className="text-sm text-app-text-muted">
              Nothing to review yet — once you&rsquo;ve scheduled and completed
              some tasks, your week will show up here.
            </p>
          </Card>
        ) : (
          <>
            <MomentumTrend review={weeklyReview} />
            <CompletedSummary review={weeklyReview} />
            <StrengthenedSummary review={weeklyReview} />
            <OpenSummary review={weeklyReview} />
          </>
        )}
      </div>
    </section>
  )
}

// A week is "empty" only when there is genuinely nothing to show: no completed,
// nothing left open, and no effort logged on any day.
function isEmptyWeek(r: WeeklyReview): boolean {
  return (
    r.completedTasks.length === 0 &&
    r.missedTasks.length === 0 &&
    r.dailyMomentum.every((p) => p.percent === 0)
  )
}

function MomentumTrend({ review }: { review: WeeklyReview }) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-app-text">Daily momentum</h2>
      <p className="mt-1 text-sm text-app-text-muted">
        Share of each day&rsquo;s planned effort you completed.
      </p>

      <div className="mt-5 flex items-end justify-between gap-2">
        {review.dailyMomentum.map((point) => (
          <div key={point.date} className="flex flex-1 flex-col items-center gap-2">
            <span className="text-[11px] tabular-nums text-app-text-muted">
              {point.percent}%
            </span>
            {/* Fixed-height track with a fill rising to the day's percent. */}
            <div className="flex h-24 w-full items-end overflow-hidden rounded-md bg-app-surface-alt">
              <div
                className="w-full rounded-md bg-app-primary transition-[height] duration-500 ease-out"
                style={{ height: `${point.percent}%` }}
              />
            </div>
            <span className="text-[11px] text-app-text-muted">
              {format(parseISO(point.date), 'EEE')}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function CompletedSummary({ review }: { review: WeeklyReview }) {
  const count = review.completedTasks.length

  return (
    <Card>
      <h2 className="text-lg font-semibold text-app-text">Completed</h2>
      <p className="mt-1 text-sm text-app-text-muted">
        {count === 0
          ? 'No tasks completed in this window yet.'
          : `${count} ${plural(count, 'task')} completed this week.`}
      </p>

      {review.completedByGoal.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {review.completedByGoal.map((g) => (
            <li
              key={g.goalTitle}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="truncate text-app-text">{g.goalTitle}</span>
              <span className="shrink-0 text-app-text-muted">
                {g.count} {plural(g.count, 'task')}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}

// The dependency lens for this screen's question — "why did this week's work
// matter?" — surfaced as leverage gained: foundational subgoals the week's
// completions advanced. Rendered only when there is something to celebrate, so it
// never adds a hollow card to a light week.
function StrengthenedSummary({ review }: { review: WeeklyReview }) {
  const foundations = review.strengthenedFoundations
  if (foundations.length === 0) return null

  return (
    <Card>
      <h2 className="text-lg font-semibold text-app-text">
        Foundations you strengthened
      </h2>
      {/* One sentence: progress here lifts everything resting on it. */}
      <p className="mt-1 text-sm text-app-text-muted">
        Work you finished this week strengthened {foundations.length}{' '}
        {plural(foundations.length, 'subgoal')} that other subgoals build on.
      </p>

      <ul className="mt-4 space-y-2">
        {foundations.map((f) => (
          <li
            key={f.subgoalTitle}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="truncate text-app-text">{f.subgoalTitle}</span>
            <span className="shrink-0 text-app-text-muted">
              lifts {f.activeSupportCount} active{' '}
              {plural(f.activeSupportCount, 'subgoal')}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function OpenSummary({ review }: { review: WeeklyReview }) {
  const count = review.missedTasks.length

  return (
    <Card>
      <h2 className="text-lg font-semibold text-app-text">Still open</h2>
      {/* Neutral, forward-looking framing — never "missed" or "failed". */}
      <p className="mt-1 text-sm text-app-text-muted">
        {count === 0
          ? 'Nothing from this week is still open — you stayed on top of it.'
          : `${count} ${plural(count, 'task')} from this week ${
              count === 1 ? 'is' : 'are'
            } still open. You can reschedule ${
              count === 1 ? 'it' : 'them'
            } whenever it suits you.`}
      </p>
    </Card>
  )
}

function Card({ children }: { children: ReactNode }) {
  // Spacing between cards is owned by the parent's space-y; the card itself is
  // margin-free.
  return (
    <div className="rounded-app-lg border border-app-border bg-app-surface p-6">
      {children}
    </div>
  )
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`
}

function formatDay(date: string): string {
  return format(parseISO(date), 'd MMM')
}
