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
import { RegistryPage, RegistrySection, LeaderRow } from '@/components/ui/Registry'

export function WeeklyReviewPage() {
  const weeklyReview = useGoalStore((s) => s.weeklyReview)
  const isLoading = useGoalStore((s) => s.isLoadingReview)
  const loadWeeklyReview = useGoalStore((s) => s.loadWeeklyReview)

  // Load on mount (this is the page that owns the review data, not the dashboard).
  useEffect(() => {
    void loadWeeklyReview()
  }, [loadWeeklyReview])

  const subtitle = weeklyReview
    ? `Window · ${formatDay(weeklyReview.windowStart)} – ${formatDay(weeklyReview.windowEnd)}`
    : 'The last 7 days, including today'

  return (
    <RegistryPage kicker="LifeMap — Weekly Review" title="Weekly Review" subtitle={subtitle}>
      {isLoading && !weeklyReview ? (
        <Note>Compiling your week…</Note>
      ) : !weeklyReview ? null : isEmptyWeek(weeklyReview) ? (
        <Note>
          Nothing to review yet — once you&rsquo;ve scheduled and completed some
          tasks, your week will show up here.
        </Note>
      ) : (
        <div className="space-y-10">
          <MomentumTrend review={weeklyReview} />
          <CompletedSummary review={weeklyReview} />
          <StrengthenedSummary review={weeklyReview} />
          <OpenSummary review={weeklyReview} />
        </div>
      )}
    </RegistryPage>
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
    <RegistrySection title="Daily Momentum" meta="Effort completed">
      <div className="flex items-end justify-between gap-2 pt-1">
        {review.dailyMomentum.map((point) => (
          <div key={point.date} className="flex flex-1 flex-col items-center gap-2">
            <span className="font-mono text-[10px] tabular-nums text-app-text-muted">
              {point.percent}%
            </span>
            {/* Fixed-height hairline track with an ink fill rising to the day's percent. */}
            <div className="flex h-24 w-full items-end border border-app-border bg-app-surface-alt">
              <div
                className="w-full bg-app-text transition-[height] duration-500 ease-out"
                style={{ height: `${point.percent}%` }}
              />
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-app-text-muted">
              {format(parseISO(point.date), 'EEE')}
            </span>
          </div>
        ))}
      </div>
    </RegistrySection>
  )
}

function CompletedSummary({ review }: { review: WeeklyReview }) {
  const count = review.completedTasks.length

  return (
    <RegistrySection
      title="Completed"
      meta={`${count} ${plural(count, 'task')}`}
      weight="hair"
    >
      <p className="text-sm text-app-text-muted">
        {count === 0
          ? 'No tasks completed in this window yet.'
          : `${count} ${plural(count, 'task')} completed this week.`}
      </p>

      {review.completedByGoal.length > 0 ? (
        <div className="mt-3">
          {review.completedByGoal.map((g) => (
            <LeaderRow
              key={g.goalTitle}
              label={g.goalTitle}
              value={`${g.count} ${plural(g.count, 'task')}`}
            />
          ))}
        </div>
      ) : null}
    </RegistrySection>
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
    <RegistrySection title="Foundations Strengthened" weight="hair">
      {/* One sentence: progress here lifts everything resting on it. */}
      <p className="text-sm text-app-text-muted">
        Work you finished this week strengthened {foundations.length}{' '}
        {plural(foundations.length, 'subgoal')} that other subgoals build on.
      </p>

      <div className="mt-3">
        {foundations.map((f) => (
          <LeaderRow
            key={f.subgoalTitle}
            label={f.subgoalTitle}
            value={`lifts ${f.activeSupportCount} active`}
          />
        ))}
      </div>
    </RegistrySection>
  )
}

function OpenSummary({ review }: { review: WeeklyReview }) {
  const count = review.missedTasks.length

  return (
    <RegistrySection title="Still Open" meta={`${count} ${plural(count, 'task')}`} weight="hair">
      {/* Neutral, forward-looking framing — never "missed" or "failed". */}
      <p className="text-sm text-app-text-muted">
        {count === 0
          ? 'Nothing from this week is still open — you stayed on top of it.'
          : `${count} ${plural(count, 'task')} from this week ${
              count === 1 ? 'is' : 'are'
            } still open. You can reschedule ${
              count === 1 ? 'it' : 'them'
            } whenever it suits you.`}
      </p>
    </RegistrySection>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="border border-app-border bg-app-surface p-8 text-sm text-app-text-muted">
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
