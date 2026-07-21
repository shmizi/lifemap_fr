// Goal Detail View — the first "real" deep page (Phase 1).
//
// WHY it only renders: it consumes one fully-assembled GoalTree via
// useGoalTree(id) and walks it into collapsible cards. It does NO database
// access and NO progress/health/priority calculation — the tree arrives already
// composed from the repository layer (hierarchyRepository.getGoalTree). Per the
// layered-complexity rule there is deliberately no graph here; that is a later
// phase. Lives in pages/ (route-level), pulling sub-parts from features/goals/.

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Plus,
  Pencil,
  Sparkles,
  CalendarPlus,
  CalendarClock,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ROUTES, GOAL_CATEGORY_OPTIONS } from '@/core/constants'
import { googleCalendarUrl } from '@/core/utils/googleCalendar'
import { useGoalTree } from '@/core/hooks/useGoalTree'
import { useGoalStore } from '@/store/useGoalStore'
import { ProgressRing } from '@/components/progress/ProgressRing'
import { SubgoalSection } from '@/features/goals/SubgoalSection'
import { StrategyBriefPanel } from '@/features/goals/StrategyBriefPanel'
import { ScopeCutNudge } from '@/features/goals/ScopeCutNudge'
import { StructureReviewModal } from '@/features/goals/StructureReviewModal'
import { SubgoalCreationModal } from '@/features/goals/SubgoalCreationModal'
import { GoalLearningsPanel } from '@/features/goals/GoalLearningsPanel'
import { SuggestedSubgoalsModal } from '@/features/goals/SuggestedSubgoalsModal'
import { GoalCreationModal } from '@/features/goals/GoalCreationModal'
import { SlipReasonModal } from '@/features/health/SlipReasonModal'
import type { Goal, SlipReason } from '@/core/types'

function categoryLabel(value: Goal['category']): string {
  return GOAL_CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? value
}

export function GoalDetailPage() {
  // The /goals/:id route guarantees an id segment, but useParams types it as
  // possibly undefined; we normalise to '' and let the not-found branch handle
  // the (in practice unreachable) empty case.
  const { id = '' } = useParams<{ id: string }>()
  const { tree, isLoading } = useGoalTree(id)
  // Whole-goal momentum, derived from the same tree by the store. Shown in the
  // header above the per-subgoal rings; hidden until the goal has tasks.
  const goalProgress = useGoalStore((s) => s.currentGoalProgress)
  // Phase 10 — the finish projection + deadline hardness the store computes on tree
  // load. Together they gate the hard-deadline scope-cut nudge (behind + hard).
  const goalProjection = useGoalStore((s) => s.currentGoalProjection)
  const goalDeadlineHardness = useGoalStore((s) => s.currentGoalDeadlineHardness)
  const [isAddSubgoalOpen, setIsAddSubgoalOpen] = useState(false)
  const [isSuggestSubgoalsOpen, setIsSuggestSubgoalsOpen] = useState(false)
  const [isEditGoalOpen, setIsEditGoalOpen] = useState(false)
  // One-click autonomous roadmap build (subgoals -> milestones -> dated tasks).
  const generateFullRoadmap = useGoalStore((s) => s.generateFullRoadmap)
  const [isGenerating, setIsGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  // Phase 10, Stage 2 — the staged STRUCTURE build (model-scoped tracks + phases,
  // undated). Only offered on a goal with no subgoals yet (structure seeds the arc).
  // The model's proposal is reviewed/edited before anything is written (the modal
  // owns its own fetch/loading/error).
  const [isStructureReviewOpen, setIsStructureReviewOpen] = useState(false)
  // Reschedule-on-miss: pull this goal's overdue tasks back onto upcoming days.
  const rescheduleOverdueForGoal = useGoalStore((s) => s.rescheduleOverdueForGoal)
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [rescheduleNote, setRescheduleNote] = useState<string | null>(null)
  // Stage 3 — the reschedule reason prompt + the goal's dominant slip pattern.
  const [reasonOpen, setReasonOpen] = useState(false)
  const slipInsight = useGoalStore((s) => s.currentGoalSlipInsight)

  // Manual de-dup: sweep near-identical task titles across this goal's subgoals and
  // drop the later copies (the same pass generateFullRoadmap runs automatically).
  const dedupeGoalTasks = useGoalStore((s) => s.dedupeGoalTasks)
  const [isDeduping, setIsDeduping] = useState(false)
  const [dedupeNote, setDedupeNote] = useState<string | null>(null)

  // Auto top-up: on opening a goal, extend any consistency subgoal whose rolling
  // task window is running low. Best-effort and once per goal — it only fires AI
  // for subgoals that are actually low (a freshly generated plan is not), so most
  // opens do nothing. Runs in the background; new tasks appear as they land.
  const topUpRoadmap = useGoalStore((s) => s.topUpRoadmap)
  const toppedUpFor = useRef<string | null>(null)
  useEffect(() => {
    if (!id || toppedUpFor.current === id) return
    toppedUpFor.current = id
    void topUpRoadmap(id)
  }, [id, topUpRoadmap])

  if (isLoading) {
    return (
      <section className="mx-auto max-w-3xl">
        <BackLink />
        <CenteredNote>Loading goal...</CenteredNote>
      </section>
    )
  }

  if (!tree) {
    return (
      <section className="mx-auto max-w-3xl">
        <BackLink />
        <CenteredNote>
          This goal could not be found. It may have been deleted.
        </CenteredNote>
      </section>
    )
  }

  const { goal, subgoals } = tree

  // The scope-cut escalation shows only when the goal is projected to miss a HARD
  // deadline: the date can't move, so rescheduling can't rescue it — the plan must
  // shrink. A soft deadline (or on-pace goal) never sees this.
  const isBehindHardDeadline =
    goalDeadlineHardness === 'hard' &&
    goalProjection !== null &&
    goalProjection.daysBehind > 0

  // Overdue = scheduled before today AND not yet completed (missed work). Derived
  // read-only from the loaded tree; drives the reschedule nudge below.
  const today = format(new Date(), 'yyyy-MM-dd')
  const overdueCount = subgoals
    .flatMap((st) => [...st.looseTasks, ...st.milestones.flatMap((m) => m.tasks)])
    .filter(
      (t) =>
        t.scheduledDate !== undefined &&
        t.scheduledDate < today &&
        t.status !== 'completed',
    ).length

  // Move this goal's missed tasks forward onto upcoming working days (capacity- and
  // deadline-aware in the store). The store refreshes the tree, so overdueCount
  // recomputes and the nudge clears on success.
  async function handleReschedule(reason: SlipReason) {
    if (isRescheduling) return
    setIsRescheduling(true)
    setRescheduleNote(null)
    try {
      const moved = await rescheduleOverdueForGoal(goal.id, reason)
      setReasonOpen(false)
      setRescheduleNote(
        moved > 0
          ? `Moved ${moved} missed task${moved === 1 ? '' : 's'} onto your upcoming days.`
          : 'Nothing needed rescheduling.',
      )
    } catch {
      setRescheduleNote('Could not reschedule just now. Please try again.')
    } finally {
      setIsRescheduling(false)
    }
  }

  async function handleDedupe() {
    if (isDeduping) return
    setIsDeduping(true)
    setDedupeNote(null)
    try {
      const removed = await dedupeGoalTasks(goal.id)
      setDedupeNote(
        removed > 0
          ? `Removed ${removed} duplicate task${removed === 1 ? '' : 's'}.`
          : 'No duplicate tasks found.',
      )
    } catch {
      setDedupeNote('Could not check for duplicates just now. Please try again.')
    } finally {
      setIsDeduping(false)
    }
  }

  // Build (or fill in) the whole roadmap with AI. Long-running — multiple model
  // calls — so it carries its own loading + inline error, distinct from the calm
  // refresh banner. The store's add* writes refresh the open tree as they land,
  // so the page fills in progressively while this runs.
  async function handleGenerateRoadmap() {
    if (isGenerating) return
    setIsGenerating(true)
    setGenError(null)
    try {
      await generateFullRoadmap(goal.id)
    } catch (e) {
      setGenError(
        e instanceof Error ? e.message : 'Could not generate the roadmap.',
      )
    } finally {
      setIsGenerating(false)
    }
  }


  return (
    <section className="mx-auto max-w-3xl">
      <BackLink />

      {/* Goal header */}
      <header className="mt-4 rounded-app-lg border border-app-border bg-app-surface p-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-app-text">
            {goal.title}
          </h1>
          <div className="flex shrink-0 items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-app-text-muted">
              {categoryLabel(goal.category)}
            </span>
            <button
              type="button"
              onClick={() => setIsEditGoalOpen(true)}
              className="inline-flex items-center gap-1.5 border border-app-border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-app-text transition hover:bg-app-surface-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              <Pencil size={14} />
              Edit
            </button>
          </div>
        </div>

        {/* Headline action: let the AI build the entire roadmap from this goal —
            subgoals, milestones, and a dated run of daily tasks — in one click. */}
        <div className="mt-4">
          <button
            type="button"
            onClick={handleGenerateRoadmap}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 bg-app-text px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-app-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          >
            <Sparkles size={16} />
            {isGenerating ? 'Building your roadmap…' : 'Generate roadmap with AI'}
          </button>
          {isGenerating ? (
            <p className="mt-2 text-xs text-app-text-muted">
              Drafting subgoals, milestones, and daily tasks. This takes a little
              while — the plan fills in as it goes.
            </p>
          ) : null}
          {genError ? (
            <p className="mt-2 text-xs text-red-600">{genError}</p>
          ) : null}
        </div>

        {goal.description ? (
          <p className="mt-3 text-sm text-app-text-muted">{goal.description}</p>
        ) : null}

        {/* Whole-goal momentum — the calm ring mirrors the per-subgoal rings
            below it. Hidden when the goal has no tasks (nothing to show yet). */}
        {goalProgress.total > 0 ? (
          <div className="mt-4 flex items-center gap-3">
            <ProgressRing
              percent={goalProgress.percent}
              size={48}
              strokeWidth={5}
              ariaLabel={`${goalProgress.completed} of ${goalProgress.total} tasks complete`}
            />
            <span className="text-sm text-app-text-muted">
              {goalProgress.completed} of {goalProgress.total} tasks done
            </span>
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.14em] text-app-text-muted">
          <p>Target {format(parseISO(goal.targetDate), 'd MMM yyyy')}</p>
          <a
            href={googleCalendarUrl({
              title: `Deadline: ${goal.title}`,
              date: goal.targetDate,
              details: goal.description,
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          >
            <CalendarPlus size={13} aria-hidden />
            Add to Google Calendar
          </a>
        </div>
      </header>

      {/* Reschedule-on-miss: when tasks have slipped past their date, offer to pull
          them back onto upcoming days (capacity/deadline aware). Clears itself once
          nothing is overdue. */}
      {overdueCount > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-app-lg border border-app-border bg-app-surface-alt p-4">
          <p className="text-sm text-app-text">
            <span className="font-medium text-amber-600">
              {overdueCount} missed task{overdueCount === 1 ? '' : 's'}
            </span>{' '}
            slipped past their date.
          </p>
          <button
            type="button"
            onClick={() => setReasonOpen(true)}
            disabled={isRescheduling}
            className="inline-flex items-center gap-1.5 border border-app-border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-app-text transition hover:bg-app-surface-alt disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          >
            <CalendarClock size={15} aria-hidden />
            {isRescheduling ? 'Rescheduling…' : 'Reschedule onto upcoming days'}
          </button>
        </div>
      ) : null}
      {rescheduleNote ? (
        <p className="mt-2 text-xs text-app-text-muted">{rescheduleNote}</p>
      ) : null}

      {/* Stage 3 — the dominant slip PATTERN for this goal (why work keeps slipping),
          drawn from its reschedule reason log. A calm, actionable read, not a scold. */}
      {slipInsight ? (
        <p className="mt-2 text-xs text-amber-600">{slipInsight.text}</p>
      ) : null}

      {/* Hard-deadline escalation: when the goal is projected to miss a deadline that
          can't move, offer an AI scope-cut proposal (the user approves the changes). */}
      {isBehindHardDeadline && goalProjection ? (
        <ScopeCutNudge goalId={goal.id} daysBehind={goalProjection.daysBehind} />
      ) : null}

      {/* Direction layer (Phase 10) — the strategy brief, above the roadmap:
          "what am I really aiming at?" before "what do I do?". */}
      <StrategyBriefPanel goalId={goal.id} />

      {/* Living "what I've learned" note — refines the goal on the way by feeding
          the user's evolving understanding into every AI generation. key resets
          the local editor state when navigating between goals. */}
      <GoalLearningsPanel key={goal.id} goalId={goal.id} />

      {/* Subgoals */}
      <div className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-app-text">
            Subgoals
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSuggestSubgoalsOpen(true)}
              className="inline-flex items-center gap-1.5 border border-app-border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-app-text transition hover:bg-app-surface-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              <Sparkles size={15} />
              Suggest subgoals
            </button>
            <button
              type="button"
              onClick={() => setIsAddSubgoalOpen(true)}
              className="inline-flex items-center gap-1.5 border border-app-border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-app-text transition hover:bg-app-surface-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              <Plus size={15} />
              Add subgoal
            </button>
            {subgoals.length > 0 ? (
              <button
                type="button"
                onClick={handleDedupe}
                disabled={isDeduping}
                title="Remove near-identical duplicate tasks across subgoals"
                className="inline-flex items-center gap-1.5 border border-app-border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-app-text transition hover:bg-app-surface-alt disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
              >
                {isDeduping ? 'Checking…' : 'Remove duplicates'}
              </button>
            ) : null}
          </div>
        </div>
        {dedupeNote ? (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-app-text-muted">
            {dedupeNote}
          </p>
        ) : null}

        {subgoals.length === 0 ? (
          <div className="mt-3 rounded-app-lg border border-dashed border-app-border bg-app-surface p-8 text-center">
            <p className="text-sm text-app-text-muted">
              No subgoals yet. Let the AI draft the whole plan, or build it yourself.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={handleGenerateRoadmap}
                disabled={isGenerating}
                className="inline-flex items-center gap-1.5 bg-app-text px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-app-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
              >
                <Sparkles size={16} />
                {isGenerating ? 'Building your roadmap…' : 'Generate roadmap with AI'}
              </button>
              <button
                type="button"
                onClick={() => setIsStructureReviewOpen(true)}
                className="inline-flex items-center gap-1.5 border border-app-border px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-app-text transition hover:bg-app-surface-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
              >
                <Sparkles size={16} />
                Generate structure only
              </button>
              <button
                type="button"
                onClick={() => setIsAddSubgoalOpen(true)}
                className="inline-flex items-center gap-1.5 border border-app-border px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-app-text transition hover:bg-app-surface-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
              >
                <Plus size={16} />
                Add subgoal manually
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {subgoals.map((subgoalTree) => (
              <SubgoalSection
                key={subgoalTree.subgoal.id}
                data={subgoalTree}
                goalId={goal.id}
                goalTitle={goal.title}
              />
            ))}
          </div>
        )}
      </div>

      <SubgoalCreationModal
        goalId={goal.id}
        open={isAddSubgoalOpen}
        onClose={() => setIsAddSubgoalOpen(false)}
      />

      {/* AI-suggested subgoals for this goal (accept / edit / reject). */}
      <SuggestedSubgoalsModal
        goalId={goal.id}
        open={isSuggestSubgoalsOpen}
        onClose={() => setIsSuggestSubgoalsOpen(false)}
        context={{
          goalId: goal.id,
          goalTitle: goal.title,
          goalDescription: goal.description,
          goalCategory: categoryLabel(goal.category),
          existingSubgoalTitles: subgoals.map((st) => st.subgoal.title),
        }}
      />

      {/* Edit THIS goal. */}
      <GoalCreationModal
        goal={goal}
        open={isEditGoalOpen}
        onClose={() => setIsEditGoalOpen(false)}
      />

      {/* Review the AI-proposed structure before it's written (tracks + phases). */}
      <StructureReviewModal
        goalId={goal.id}
        open={isStructureReviewOpen}
        onClose={() => setIsStructureReviewOpen(false)}
      />

      <SlipReasonModal
        isOpen={reasonOpen}
        onClose={() => setReasonOpen(false)}
        onSelect={handleReschedule}
        isBusy={isRescheduling}
        count={overdueCount}
      />
    </section>
  )
}

function BackLink() {
  return (
    <Link
      to={ROUTES.GOALS}
      className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-app-text-muted transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
    >
      <ArrowLeft size={14} />
      All goals
    </Link>
  )
}

function CenteredNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 border border-app-border bg-app-surface p-10 text-center text-sm text-app-text-muted">
      {children}
    </div>
  )
}