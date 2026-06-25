// Goal store — the single place the UI reads goal-list and goal-tree state from,
// and the only place (besides repositories) that orchestrates writes.
//
// Locked data flow: Database -> Repositories -> Store action -> Hook -> UI.
// UI components never import a repository directly; they call these actions.
//
// State kept deliberately small:
//   - goals[]          : the flat list shown on the Goals page
//   - todaysTasks[]    : tasks scheduled for today, for the Dashboard
//   - selectedGoalId   : which goal the user is focused on
//   - currentGoalTree  : the assembled read-only tree for the Goal Detail View
// No derived/health/priority values are cached here — those are engine concerns
// in later phases.

import { create } from 'zustand'
import { format, addDays } from 'date-fns'
import type {
  Goal,
  Subgoal,
  Milestone,
  Task,
  GoalTree,
  TaskLineage,
  Dependency,
  ID,
} from '@/core/types'
import { computeEffortMomentum } from '@/engine/progress/computeEffortMomentum'
import type { Completion } from '@/engine/progress/computeCompletion'
import {
  computeGoalProgress,
  type GoalProgress,
} from '@/engine/progress/computeGoalProgress'
import {
  computeSubgoalProgress,
  type SubgoalProgress,
} from '@/engine/progress/computeSubgoalProgress'
import {
  computeGoalHealth,
  type GoalHealth,
} from '@/engine/health/computeGoalHealth'
import { computeLaggingFoundation } from '@/engine/health/computeLaggingFoundation'
import { isMilestoneComplete } from '@/engine/progress/isMilestoneComplete'
import { rankTasks, DEFAULT_TOP_N } from '@/engine/priority/rankTasks'
import { computeActiveSupportCounts } from '@/engine/priority/dependencyBoost'
import { buildRoadmap } from '@/engine/roadmap/buildRoadmap'
import {
  computeWeeklyReview,
  type WeeklyReviewData,
} from '@/engine/review/computeWeeklyReview'
import { computeStrengthenedFoundations } from '@/engine/review/computeStrengthenedFoundations'
import { buildMilestonePrompt } from '@/engine/ai/prompts/milestones'
import { parseMilestoneSuggestions } from '@/engine/ai/parsers/milestones'
import type {
  MilestoneSuggestion,
  MilestoneSuggestionContext,
} from '@/engine/ai/types'
import { aiProvider } from '@/services/ai'
import {
  getAllGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  getGoalTree,
  getSubgoalsByGoalId,
  createSubgoal,
  updateSubgoal,
  deleteSubgoal,
  getSubgoalsByStatus,
  getMilestonesBySubgoalId,
  getMilestoneById,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  getTasksBySubgoalId,
  getTasksByMilestoneId,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  getTasksScheduledBetween,
  getTasksScheduledBefore,
  getTaskLineages,
  getTasksByGoalId,
  getAllTasks,
  getDependenciesByType,
} from '@/database/repositories'

// User-facing copy for the store's NON-FATAL failure states. Kept calm and
// generic — the user gets a gentle nudge, never a stack trace. WHY defined here
// and not in core/constants: these belong to the store's error plumbing, not the
// shared UI vocabulary other components reach for.
const REFRESH_ERROR_MESSAGE =
  'Something went wrong updating the view. What you see may be out of date.'
const LOAD_ERROR_MESSAGE =
  'Something went wrong loading your data. Please try again.'

// ── "New X" input shapes (creation forms) ───────────────────────────────────
// The repository owns id + timestamps; the store action owns `order` where the
// entity has one. So the form supplies neither id/timestamps nor order.
export type NewGoalInput = Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>
export type NewSubgoalInput = Omit<
  Subgoal,
  'id' | 'createdAt' | 'updatedAt' | 'order'
>
export type NewMilestoneInput = Omit<Milestone, 'id' | 'createdAt' | 'order'>
export type NewTaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'order'>

// ── "Changes" shapes (edit forms) ───────────────────────────────────────────
// Patchable fields only; immutable id/timestamps are excluded (repositories
// manage timestamps). Each is assignable to its repository's update() parameter.
export type GoalChanges = Partial<Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>>
export type SubgoalChanges = Partial<
  Omit<Subgoal, 'id' | 'createdAt' | 'updatedAt'>
>
export type MilestoneChanges = Partial<Omit<Milestone, 'id' | 'createdAt'>>
export type TaskChanges = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>

// ── Weekly Review view-model ─────────────────────────────────────────────────
// The pure engine result (WeeklyReviewData) plus the goal-grouping the store
// assembles on top (completed-task counts per goal, via the lineage mechanism).
// Grouping is here, not in the engine, because it needs a repository lookup.
export interface CompletedGoalCount {
  goalTitle: string
  count: number
}
// The Weekly Review's dependency signal, resolved to a title for display: a
// foundational subgoal the user advanced this week (see computeStrengthenedFoundations).
// Per the "one question per screen" principle, the dependency graph appears in
// the review as leverage GAINED ("why did this week's work matter?"), distinct
// from the dashboard's to-do framing and the roadmap's connection map.
export interface StrengthenedFoundationNote {
  subgoalTitle: string
  activeSupportCount: number
}
export type WeeklyReview = WeeklyReviewData & {
  completedByGoal: CompletedGoalCount[]
  strengthenedFoundations: StrengthenedFoundationNote[]
}

// ── Goal Health view-model (Phase 3 pace + Phase 4 dependency signal) ─────────
// A goal's health for the UI: the PACE signal (computeGoalHealth) PLUS the
// SEPARATE dependency signal (computeLaggingFoundation), resolved to subgoal
// titles. The two are kept as distinct fields and never blended — the card shows
// the pace badge and, independently, a one-line "foundation lagging" note. Adding
// the second signal as its own field (not a new status) is what keeps the pace
// score a single, explainable contributor.
export interface LaggingFoundationNote {
  foundationTitle: string
  dependentTitle: string
}
export type GoalHealthView = GoalHealth & {
  laggingFoundation: LaggingFoundationNote | null
}

// ── Roadmap view-model (Phase 4) ─────────────────────────────────────────────
// The dependency-ordered "stations" for ONE goal: each subgoal joined to its
// resolved supporters / supported subgoals (so the UI has titles, not bare ids)
// and its active-support count. The pure engine (buildRoadmap) produces the
// ordering and graph facts over ids; the store joins those ids back to Subgoal
// objects here, keeping the roadmap UI dumb — exactly how WeeklyReview's
// completed-by-goal grouping is assembled on top of its engine result.
export interface RoadmapStation {
  subgoal: Subgoal
  // How many still-active subgoals this one supports ("Supports N active subgoals").
  activeSupportCount: number
  // The subgoals that strengthen this one (resolved from the engine's ids).
  supportedBy: Subgoal[]
  // The subgoals this one strengthens (resolved from the engine's ids).
  supports: Subgoal[]
}
export interface RoadmapView {
  goalId: ID
  stations: RoadmapStation[]
  // A support cycle made a complete ordering impossible; the UI shows a calm note.
  cyclic: boolean
}

// A goal paired with all its tasks — the shared shape gatherGoalsWithTasks
// produces and the two cross-goal refreshers (progress/health and top-priority)
// both consume. Named so loadDashboard can fetch it once and pass it to both.
type GoalWithTasks = { goal: Goal; tasks: Task[] }

interface GoalState {
  // --- goal list ---
  goals: Goal[]
  // Task-completion momentum per goal, keyed by goalId, computed by the engine
  // (never inline). Feeds the calm progress ring on each GoalCard. Refreshed
  // whenever the goal list is (re)loaded or a goal is added/edited/removed.
  goalProgress: Record<ID, GoalProgress>
  // Per-goal health, keyed by goalId, computed by the engine in the SAME pass as
  // goalProgress so a card's progress and health never disagree. Two SEPARATE,
  // each-explainable signals (never blended): pace vs. deadline (status/score)
  // and the dependency "lagging foundation" note. GoalCard reads its own entry;
  // 'no_tasks' goals render no pace badge, and laggingFoundation is null unless
  // a foundation is trailing the work that leans on it.
  goalHealth: Record<ID, GoalHealthView>
  isLoadingGoals: boolean
  loadGoals: () => Promise<void>
  addGoal: (input: NewGoalInput) => Promise<Goal>
  editGoal: (id: ID, changes: GoalChanges) => Promise<void>
  removeGoal: (id: ID) => Promise<void>

  // --- dashboard (today + overdue + upcoming) ---
  // Three scheduled-task windows the dashboard shows side by side. All keyed off
  // the local calendar day (scheduledDate is date-only YYYY-MM-DD):
  //   overdueTasks  : scheduled before today AND not completed (still owed)
  //   todaysTasks   : scheduled for today
  //   thisWeekTasks : scheduled tomorrow .. 7 days out (rolling upcoming window)
  overdueTasks: Task[]
  todaysTasks: Task[]
  thisWeekTasks: Task[]
  // "Why it matters" lineage for every task shown across the three windows,
  // keyed by subgoalId (lineage is shared by all tasks under a subgoal). The
  // dashboard reads it to render each task's "Subgoal · Goal" context.
  // Refreshed in the same pass as the windows so a row and its lineage agree.
  taskLineages: Record<ID, TaskLineage>
  // Effort-based momentum for today's scheduled tasks ("how much work today",
  // not "how many tasks"): completed/total are EFFORT UNITS, not counts. Computed
  // by the engine (never inline) over todaysTasks; MomentumBar reads it.
  todayEffort: Completion
  // A small focus list: the top-scored INCOMPLETE tasks across ALL goals, ranked
  // by the priority engine — independent of whether they are scheduled for today.
  // This is a different lens from todaysTasks (which is "what I planned today").
  // Refreshed on dashboard load and after any task mutation.
  topPriorityTasks: Task[]
  // Active-support count per subgoalId (how many not-yet-complete subgoals it
  // supports), computed from the soft dependency graph. Feeds two things in one
  // pass: the dependencyBoost applied inside the priority ranking above, AND the
  // "Supports N active subgoals" explanation the Priority panel shows for a
  // boosted task. Keyed by subgoalId because the count is a property of the
  // subgoal, shared by all its tasks.
  subgoalSupportCounts: Record<ID, number>
  isLoadingDashboard: boolean
  loadDashboard: () => Promise<void>

  // --- selection ---
  selectedGoalId: ID | null
  setSelectedGoalId: (id: ID | null) => void
  clearSelectedGoal: () => void

  // --- goal tree (consumed by the Goal Detail View via useGoalTree) ---
  currentGoalTree: GoalTree | null
  // Per-subgoal task-completion momentum for the on-screen tree, keyed by
  // subgoalId, computed by the engine from the tree the store already holds.
  // Each SubgoalSection reads its own entry to draw a progress ring. Rebuilt
  // every time currentGoalTree is (re)assembled so the two never disagree.
  subgoalProgress: Record<ID, SubgoalProgress>
  // Whole-goal task-completion momentum for the on-screen tree (every task
  // across all its subgoals), shown in the Goal Detail header. Derived from the
  // same tree, in the same pass, so it never drifts from the per-subgoal rings.
  currentGoalProgress: GoalProgress
  isLoadingTree: boolean
  loadGoalTree: (id: ID) => Promise<void>

  addSubgoal: (input: NewSubgoalInput) => Promise<Subgoal>
  editSubgoal: (id: ID, changes: SubgoalChanges) => Promise<void>
  removeSubgoal: (id: ID) => Promise<void>

  addMilestone: (input: NewMilestoneInput) => Promise<Milestone>
  editMilestone: (id: ID, changes: MilestoneChanges) => Promise<void>
  removeMilestone: (id: ID) => Promise<void>

  addTask: (input: NewTaskInput) => Promise<Task>
  editTask: (id: ID, changes: TaskChanges) => Promise<void>
  removeTask: (id: ID) => Promise<void>
  toggleTaskComplete: (task: Task) => Promise<void>

  // --- weekly review (its own /reviews route; loaded by that page, NOT bundled
  // into the dashboard load) ---
  weeklyReview: WeeklyReview | null
  isLoadingReview: boolean
  loadWeeklyReview: () => Promise<void>

  // --- roadmap (read-only; one goal at a time; consumed via useRoadmap) ---
  // The dependency-ordered subgoals for the goal the Roadmap page is showing.
  // Read-only by design: creating/removing edges stays on the Goal Detail panel
  // (roadmap = comprehension, detail = editing). Single-slot like currentGoalTree.
  currentRoadmap: RoadmapView | null
  isLoadingRoadmap: boolean
  loadRoadmap: (goalId: ID) => Promise<void>

  // --- AI assistance (Phase 5) ---
  // Ask the AI provider for milestone suggestions for one subgoal. READ-ONLY: it
  // returns suggestions for the UI to present (accept/edit/reject); it writes
  // nothing. Accepting a suggestion goes through the EXISTING addMilestone path
  // with aiSuggested: true, so there is no separate AI write path. The store
  // talks only to the AIProvider interface (services/ai) and the pure prompt/
  // parser (engine/ai) — it never knows which model, or that a network exists.
  // Unlike the best-effort refreshers, this is user-triggered and awaited, so a
  // transport failure PROPAGATES to the caller (the modal shows it inline, like a
  // failed save) rather than the calm background banner. A malformed response is
  // not a failure: the parser yields [] and the user just adds milestones manually.
  suggestMilestones: (
    context: MilestoneSuggestionContext,
  ) => Promise<MilestoneSuggestion[]>

  // --- cross-cutting error state ---
  // A single, calm, NON-FATAL message set when a background load or post-write
  // refresh fails (e.g. an IndexedDB read rejects). Null when all is well. The
  // app shell shows a dismissible banner; clearError dismisses it. WRITES still
  // throw to their caller (forms handle those inline) — this covers the read-back
  // path the user did not directly trigger and could not otherwise see fail.
  error: string | null
  clearError: () => void
}

export const useGoalStore = create<GoalState>()((set, get) => {
  // Re-fetch the on-screen goal's tree in place (no loading flash). Called after
  // any subgoal/milestone/task mutation so the Detail View reflects it. Reads
  // the goal id from the currently-loaded tree, since every such mutation
  // happens while that goal is on screen.
  // Derive each subgoal's task-completion progress from an assembled tree. A
  // subgoal's tasks are its loose tasks plus every task across its milestones —
  // the tree already holds them, so this needs no extra DB read. The engine does
  // the math; this only gathers the inputs and keys the result by subgoalId.
  const subgoalProgressFromTree = (
    tree: GoalTree | null,
  ): Record<ID, SubgoalProgress> => {
    const result: Record<ID, SubgoalProgress> = {}
    if (!tree) return result
    for (const st of tree.subgoals) {
      result[st.subgoal.id] = computeSubgoalProgress(tasksOfSubgoal(st))
    }
    return result
  }

  // The tasks belonging to one subgoal: its loose tasks plus every task across
  // its milestones. Shared by the per-subgoal and whole-goal progress derivations
  // so they count exactly the same set.
  const tasksOfSubgoal = (st: GoalTree['subgoals'][number]): Task[] => [
    ...st.looseTasks,
    ...st.milestones.flatMap((m) => m.tasks),
  ]

  // Whole-goal progress = every task across every subgoal, computed by the
  // engine. 0/0 when the tree is absent so the header reads as nothing scheduled
  // rather than stale.
  const goalProgressFromTree = (tree: GoalTree | null): GoalProgress =>
    computeGoalProgress(tree ? tree.subgoals.flatMap(tasksOfSubgoal) : [])

  const refreshCurrentTree = async () => {
    const goalId = get().currentGoalTree?.goal.id
    if (goalId) {
      const tree = (await getGoalTree(goalId)) ?? null
      set({
        currentGoalTree: tree,
        subgoalProgress: subgoalProgressFromTree(tree),
        currentGoalProgress: goalProgressFromTree(tree),
      })
    }
  }

  // Re-fetch all three dashboard windows in place (no loading-flag flip -> no
  // flicker), mirroring refreshCurrentTree. Called after any task mutation so the
  // dashboard reflects it without a remount. Every bound is a date-only LOCAL day
  // (scheduledDate is stored date-only YYYY-MM-DD); the three reads run in
  // parallel and today's momentum is recomputed via the engine in the same pass
  // so the list and its progress never drift.
  const refreshDashboard = async () => {
    const now = new Date()
    const today = format(now, 'yyyy-MM-dd')
    const tomorrow = format(addDays(now, 1), 'yyyy-MM-dd')
    const weekOut = format(addDays(now, 7), 'yyyy-MM-dd')

    const [overdueRaw, todaysTasks, thisWeekTasks] = await Promise.all([
      getTasksScheduledBefore(today),
      getTasksScheduledBetween(today, today),
      getTasksScheduledBetween(tomorrow, weekOut),
    ])

    // Overdue means still owed: drop past tasks that are already done. (The repo
    // returns raw rows; status filtering is the caller's job, per convention.)
    const overdueTasks = overdueRaw.filter((t) => t.status !== 'completed')

    // Resolve each shown task's subgoal -> goal lineage in one deduped pass. This
    // is a second round-trip (it needs the windows' subgoalIds first); fine at
    // this scale, and it keeps lineage in sync with the very tasks displayed.
    const taskLineages = await getTaskLineages([
      ...overdueTasks,
      ...todaysTasks,
      ...thisWeekTasks,
    ])

    set({
      overdueTasks,
      todaysTasks,
      thisWeekTasks,
      taskLineages,
      todayEffort: computeEffortMomentum(todaysTasks),
    })
  }

  // Gather every goal paired with its tasks, composing the existing getters
  // (getAllGoals + getTasksByGoalId). Single source for the two consumers below
  // (per-goal progress AND the flat priority list), so the composition lives in
  // one place. NOTE: this deliberately reaches tasks only via live goals, so a
  // task orphaned by a non-cascading goal/subgoal delete is excluded — same as
  // before. (Weekly Review intentionally uses getAllTasks() for ALL rows; this
  // is a different, goal-scoped view and must stay so.)
  const gatherGoalsWithTasks = async (): Promise<GoalWithTasks[]> => {
    const goals = await getAllGoals()
    return Promise.all(
      goals.map(async (goal) => ({
        goal,
        tasks: await getTasksByGoalId(goal.id),
      })),
    )
  }

  // Reload the goal list and recompute each goal's task-completion progress in
  // one pass, then set both together so a card and its ring never disagree. The
  // per-goal task fetch + engine math is the only place goalProgress is built;
  // every goal-list mutation routes through here. Cheap at this scale (tiny
  // tables); revisit if the goal/task counts ever grow large.
  const refreshGoalsAndProgress = async (
    // loadDashboard fetches these two shared inputs once and passes them in, so
    // the gather + graph read don't run twice per dashboard load. Called with no
    // args everywhere else, where it fetches its own.
    prefetchedGoalsWithTasks?: GoalWithTasks[],
    prefetchedSubgoalEdges?: Dependency[],
  ) => {
    // Goals + their tasks (shared helper) and the subgoal dependency graph, in
    // parallel. The graph feeds the SEPARATE "lagging foundation" health signal.
    const [goalsWithTasks, subgoalEdges] = await Promise.all([
      prefetchedGoalsWithTasks ?? gatherGoalsWithTasks(),
      prefetchedSubgoalEdges ?? getDependenciesByType('subgoal'),
    ])
    // This goal's subgoals — including task-less ones, which still matter as
    // foundations (a 0%-done foundation is exactly what can lag) — fetched per
    // goal in parallel. Used to compute per-subgoal completion and to resolve the
    // lagging-foundation note's titles. Cheap at this scale; same per-goal fan-out
    // pattern as gatherGoalsWithTasks.
    const subgoalsPerGoal = await Promise.all(
      goalsWithTasks.map((g) => getSubgoalsByGoalId(g.goal.id)),
    )

    // One `now` for the whole list so every goal's health is judged against the
    // same moment. Completion is computed once per goal and reused for health.
    const now = new Date()
    const entries = goalsWithTasks.map((g, i) => {
      const progress = computeGoalProgress(g.tasks)
      const pace = computeGoalHealth(
        g.goal.createdAt,
        g.goal.targetDate,
        progress,
        now,
      )

      // Per-subgoal completion% for this goal (task-less subgoals -> 0%), keyed by
      // subgoalId. Tasks are already in hand from gatherGoalsWithTasks, so this is
      // pure in-memory grouping — no extra DB read. The pure engine then decides
      // whether any foundation is trailing the work that depends on it.
      const subgoals = subgoalsPerGoal[i]
      const completionBySubgoalId = new Map<ID, number>()
      for (const s of subgoals) {
        const subgoalTasks = g.tasks.filter((t) => t.subgoalId === s.id)
        completionBySubgoalId.set(
          s.id,
          computeSubgoalProgress(subgoalTasks).percent,
        )
      }
      const lagging = computeLaggingFoundation(subgoalEdges, completionBySubgoalId)
      const titleOf = (id: ID): string =>
        subgoals.find((s) => s.id === id)?.title ?? 'a subgoal'
      const laggingFoundation: LaggingFoundationNote | null = lagging
        ? {
            foundationTitle: titleOf(lagging.foundationId),
            dependentTitle: titleOf(lagging.dependentId),
          }
        : null

      const health: GoalHealthView = { ...pace, laggingFoundation }
      return { goal: g.goal, progress, health }
    })
    set({
      goals: entries.map((e) => e.goal),
      goalProgress: Object.fromEntries(
        entries.map((e): [ID, GoalProgress] => [e.goal.id, e.progress]),
      ),
      goalHealth: Object.fromEntries(
        entries.map((e): [ID, GoalHealthView] => [e.goal.id, e.health]),
      ),
    })
  }

  // Recompute the dashboard's top-priority focus list. It ranks EVERY incomplete
  // task across ALL goals, gathered via gatherGoalsWithTasks (goal-scoped, no new
  // repository query). rankTasks does the scoring/sorting/top-N; the store never
  // ranks inline. `new Date()` is read once here so the whole list is scored
  // against a single consistent "now".
  //
  // The soft dependency signal feeds in here too: the subgoal graph plus the set
  // of completed subgoals yield an active-support count per subgoal (engine), which
  // both nudges the ranking (dependencyBoost inside rankTasks) and is cached for
  // the Priority panel's "Supports N active subgoals" explanation. All three reads
  // run in parallel.
  const refreshTopPriority = async (
    // Same shared-input optimisation as refreshGoalsAndProgress (see there).
    prefetchedGoalsWithTasks?: GoalWithTasks[],
    prefetchedSubgoalEdges?: Dependency[],
  ) => {
    const [goalsWithTasks, subgoalEdges, completedSubgoals] = await Promise.all([
      prefetchedGoalsWithTasks ?? gatherGoalsWithTasks(),
      prefetchedSubgoalEdges ?? getDependenciesByType('subgoal'),
      getSubgoalsByStatus('completed'),
    ])
    const allTasks = goalsWithTasks.flatMap((g) => g.tasks)
    const completedSubgoalIds = new Set(completedSubgoals.map((s) => s.id))
    const subgoalSupportCounts = computeActiveSupportCounts(
      subgoalEdges,
      completedSubgoalIds,
    )
    set({
      topPriorityTasks: rankTasks(
        allTasks,
        new Date(),
        DEFAULT_TOP_N,
        subgoalSupportCounts,
      ),
      subgoalSupportCounts,
    })
  }

  // Refresh BOTH cross-goal caches — the top-priority focus list and the
  // goals-list progress/health — from a SINGLE shared fetch. The goals-with-tasks
  // gather and the subgoal-graph read happen once here and feed both refreshers,
  // rather than each fetching its own. Used wherever both must update together:
  // the dashboard load and every task mutation (a completed/added/removed task
  // changes priority AND each goal's progress/health, so they must move in step).
  const refreshCrossGoal = async (): Promise<void> => {
    const [goalsWithTasks, subgoalEdges] = await Promise.all([
      gatherGoalsWithTasks(),
      getDependenciesByType('subgoal'),
    ])
    await Promise.all([
      refreshTopPriority(goalsWithTasks, subgoalEdges),
      refreshGoalsAndProgress(goalsWithTasks, subgoalEdges),
    ])
  }

  // Apply the milestone auto-completion rule after a task changes: a milestone
  // is completed when ALL its tasks are completed, and re-opens (-> active) when
  // one is un-done. Only writes on an actual transition, so a no-op toggle costs
  // nothing. Preserves any other status (e.g. a future Phase-3 'locked') unless
  // the tasks now demand 'completed'. completedAt is stamped/cleared to match.
  const reconcileMilestone = async (milestoneId: ID) => {
    const [milestone, tasks] = await Promise.all([
      getMilestoneById(milestoneId),
      getTasksByMilestoneId(milestoneId),
    ])
    if (!milestone) return

    const shouldComplete = isMilestoneComplete(tasks)
    const isComplete = milestone.status === 'completed'
    if (shouldComplete === isComplete) return // already in the right state

    await updateMilestone(
      milestone.id,
      shouldComplete
        ? { status: 'completed', completedAt: new Date().toISOString() }
        : { status: 'active', completedAt: undefined },
    )
  }

  // Next display position among a set of siblings: max(order)+1, which is
  // collision-proof even if the existing orders have gaps.
  const nextOrder = (orders: number[]): number =>
    orders.length === 0 ? 0 : Math.max(...orders) + 1

  // Run independent refreshers concurrently as BEST EFFORT. Three guarantees:
  //  1. One failing refresh never aborts the others (allSettled, not all) — so a
  //     single bad read can't leave MORE of the view stale than necessary.
  //  2. It never throws — these run AFTER a successful write, so a failed re-read
  //     must not make the mutation look like it failed (the write already landed).
  //     Previously a rejected refresh surfaced as an unhandled promise rejection.
  //  3. It resolves the error flag either way: any rejection raises the calm
  //     refresh message; a fully-successful pass clears a stale error.
  const settleRefreshes = async (
    refreshes: Promise<unknown>[],
  ): Promise<void> => {
    const results = await Promise.allSettled(refreshes)
    set({
      error: results.some((r) => r.status === 'rejected')
        ? REFRESH_ERROR_MESSAGE
        : null,
    })
  }

  return {
    // --- cross-cutting error state ---
    error: null,
    clearError: () => set({ error: null }),

    // --- goal list ---
    goals: [],
    goalProgress: {},
    goalHealth: {},
    isLoadingGoals: false,

    loadGoals: async () => {
      set({ isLoadingGoals: true })
      try {
        await refreshGoalsAndProgress()
        set({ error: null })
      } catch {
        set({ error: LOAD_ERROR_MESSAGE })
      } finally {
        set({ isLoadingGoals: false })
      }
    },

    addGoal: async (input) => {
      const goal = await createGoal(input)
      await settleRefreshes([refreshGoalsAndProgress()])
      return goal
    },

    editGoal: async (id, changes) => {
      await updateGoal(id, changes)
      // Refresh the list and, if this goal is open in the Detail View, its tree
      // too — concurrently and best-effort (the write already succeeded).
      const refreshes = [refreshGoalsAndProgress()]
      if (get().currentGoalTree?.goal.id === id) refreshes.push(refreshCurrentTree())
      await settleRefreshes(refreshes)
    },

    // deleteGoal cascades its subtree (subgoals/milestones/tasks) AND removes any
    // dependency edges referencing the deleted subgoals/tasks, atomically in the
    // repository transaction. Nothing extra to do here.
    removeGoal: async (id) => {
      await deleteGoal(id)
      await settleRefreshes([refreshGoalsAndProgress()])
    },

    // --- dashboard (today + overdue + upcoming) ---
    overdueTasks: [],
    todaysTasks: [],
    thisWeekTasks: [],
    taskLineages: {},
    todayEffort: { completed: 0, total: 0, percent: 0 },
    topPriorityTasks: [],
    subgoalSupportCounts: {},
    isLoadingDashboard: false,

    // Initial load of the dashboard (flips the loading flag for the first paint).
    // Loads the scheduled-task windows, the cross-goal priority list, AND the
    // per-goal progress (for the Goal Progress snapshot) together. Each refresher
    // owns its own data source; refreshGoalsAndProgress is reused as-is so the
    // snapshot is populated on Dashboard mount, not only after a Goals-list visit.
    loadDashboard: async () => {
      set({ isLoadingDashboard: true })
      try {
        // Best-effort: the windows and the cross-goal caches are independent, so a
        // single failing read should not blank the whole dashboard. refreshCrossGoal
        // does the goals-list and priority refresh from one shared fetch.
        // settleRefreshes owns the error flag and never throws (can't reject load).
        await settleRefreshes([refreshDashboard(), refreshCrossGoal()])
      } finally {
        set({ isLoadingDashboard: false })
      }
    },

    // --- selection ---
    selectedGoalId: null,
    setSelectedGoalId: (id) => set({ selectedGoalId: id }),
    clearSelectedGoal: () => set({ selectedGoalId: null }),

    // --- goal tree ---
    currentGoalTree: null,
    subgoalProgress: {},
    currentGoalProgress: { completed: 0, total: 0, percent: 0 },
    isLoadingTree: false,

    // Blanks the tree first (avoids a stale-goal flash when navigating between
    // detail pages); in-place refreshes after a mutation use refreshCurrentTree.
    loadGoalTree: async (id) => {
      set({
        isLoadingTree: true,
        currentGoalTree: null,
        subgoalProgress: {},
        currentGoalProgress: { completed: 0, total: 0, percent: 0 },
      })
      try {
        const tree = (await getGoalTree(id)) ?? null
        set({
          currentGoalTree: tree,
          subgoalProgress: subgoalProgressFromTree(tree),
          currentGoalProgress: goalProgressFromTree(tree),
          error: null,
        })
      } catch {
        set({ error: LOAD_ERROR_MESSAGE })
      } finally {
        set({ isLoadingTree: false })
      }
    },

    // --- subgoals ---
    addSubgoal: async (input) => {
      const siblings = await getSubgoalsByGoalId(input.goalId)
      const order = nextOrder(siblings.map((s) => s.order))
      const subgoal = await createSubgoal({ ...input, order })
      await settleRefreshes([refreshCurrentTree()])
      return subgoal
    },
    editSubgoal: async (id, changes) => {
      await updateSubgoal(id, changes)
      await settleRefreshes([refreshCurrentTree()])
    },
    // deleteSubgoal cascades its milestones + tasks AND removes any dependency
    // edges referencing this subgoal or its deleted tasks, atomically in the
    // repository transaction.
    removeSubgoal: async (id) => {
      await deleteSubgoal(id)
      // Cascade-deleting a subgoal's tasks changes the parent goal's
      // progress/health and the lagging-foundation signal, so refresh the cached
      // goals list too — not just the open tree. (Previously the list stayed
      // stale until the Goals page remounted.)
      await settleRefreshes([refreshCurrentTree(), refreshGoalsAndProgress()])
    },

    // --- milestones ---
    addMilestone: async (input) => {
      const siblings = await getMilestonesBySubgoalId(input.subgoalId)
      const order = nextOrder(siblings.map((m) => m.order))
      const milestone = await createMilestone({ ...input, order })
      await settleRefreshes([refreshCurrentTree()])
      return milestone
    },
    editMilestone: async (id, changes) => {
      await updateMilestone(id, changes)
      await settleRefreshes([refreshCurrentTree()])
    },
    // deleteMilestone REHOMES its tasks (clears milestoneId -> loose under the
    // subgoal) and deletes only the milestone row; no task data is lost.
    removeMilestone: async (id) => {
      await deleteMilestone(id)
      await settleRefreshes([refreshCurrentTree()])
    },

    // --- tasks ---
    addTask: async (input) => {
      // A task's order is scoped to its group: same milestoneId (including both
      // undefined for loose tasks). Partition the subgoal's tasks accordingly.
      const subgoalTasks = await getTasksBySubgoalId(input.subgoalId)
      const groupOrders = subgoalTasks
        .filter((t) => t.milestoneId === input.milestoneId)
        .map((t) => t.order)
      const order = nextOrder(groupOrders)
      const task = await createTask({ ...input, order })
      // A new (pending) task under a completed milestone must re-open it.
      if (input.milestoneId) await reconcileMilestone(input.milestoneId)
      // Refresh every surface a task touches: the goal tree (Detail View), the
      // dashboard windows, and the cross-goal caches (priority list AND goals-list
      // progress/health). Best-effort — each refresher no-ops cheaply for a view
      // that isn't mounted, and one failing refresh must neither abort the others
      // nor reject this (already-saved) add.
      await settleRefreshes([
        refreshCurrentTree(),
        refreshDashboard(),
        refreshCrossGoal(),
      ])
      return task
    },
    editTask: async (id, changes) => {
      // Capture the task's milestone BEFORE the edit: an edit can change status
      // (affecting completeness) or move the task to a different milestone, so
      // both the old and the new milestone may need reconciling.
      const before = await getTaskById(id)
      await updateTask(id, changes)
      const affected = new Set<ID>()
      if (before?.milestoneId) affected.add(before.milestoneId)
      // 'milestoneId' present in changes means it was (re)assigned, even to
      // undefined; absent means it stayed put.
      const newMilestoneId =
        'milestoneId' in changes ? changes.milestoneId : before?.milestoneId
      if (newMilestoneId) affected.add(newMilestoneId)
      await Promise.all([...affected].map(reconcileMilestone))
      await settleRefreshes([
        refreshCurrentTree(),
        refreshDashboard(),
        refreshCrossGoal(),
      ])
    },
    removeTask: async (id) => {
      // Removing a task can complete its milestone (if it was the last open
      // one). Read the milestone before the row is gone.
      const before = await getTaskById(id)
      await deleteTask(id)
      if (before?.milestoneId) await reconcileMilestone(before.milestoneId)
      await settleRefreshes([
        refreshCurrentTree(),
        refreshDashboard(),
        refreshCrossGoal(),
      ])
    },

    // Flip a task between completed and pending. Completing stamps completedAt
    // (feeds reviews/streaks later); un-completing clears it so a pending task
    // never carries a stale completion time. Binary only — Phase 1 has no UI for
    // in_progress/skipped.
    toggleTaskComplete: async (task) => {
      const markingComplete = task.status !== 'completed'
      await updateTask(
        task.id,
        markingComplete
          ? { status: 'completed', completedAt: new Date().toISOString() }
          : { status: 'pending', completedAt: undefined },
      )
      // Auto-complete (or re-open) the parent milestone per the spec'd rule.
      // Loose tasks (no milestoneId) have no milestone to reconcile. Run before
      // the refreshes so the tree picks up the milestone's new status too.
      if (task.milestoneId) await reconcileMilestone(task.milestoneId)
      await settleRefreshes([
        refreshCurrentTree(),
        refreshDashboard(),
        refreshCrossGoal(),
      ])
    },

    // --- weekly review ---
    weeklyReview: null,
    isLoadingReview: false,

    // Computed LIVE (no snapshot tables, per ADR-0001): read every task once,
    // run the pure engine for the window/completed/missed/daily-momentum, then
    // assemble the completed-by-goal grouping with the existing lineage getter.
    // Triggered by the Review page itself, not the dashboard load.
    loadWeeklyReview: async () => {
      set({ isLoadingReview: true })
      try {
        // All tasks (for the live review) plus the subgoal graph and which
        // subgoals are complete (for the "foundations strengthened" signal), in
        // parallel — none depends on another.
        const [tasks, subgoalEdges, completedSubgoals] = await Promise.all([
          getAllTasks(),
          getDependenciesByType('subgoal'),
          getSubgoalsByStatus('completed'),
        ])
        const review = computeWeeklyReview(tasks, new Date())

        // Group completed tasks by their parent goal, reusing getTaskLineages
        // (keyed by subgoalId) rather than rebuilding the task->goal walk. A task
        // whose lineage no longer resolves (dangling) is left out of the grouping.
        const lineages = await getTaskLineages(review.completedTasks)
        const counts = new Map<string, number>()
        for (const task of review.completedTasks) {
          const goalTitle = lineages[task.subgoalId]?.goalTitle
          if (goalTitle === undefined) continue
          counts.set(goalTitle, (counts.get(goalTitle) ?? 0) + 1)
        }
        const completedByGoal: CompletedGoalCount[] = [...counts.entries()]
          .map(([goalTitle, count]) => ({ goalTitle, count }))
          .sort((a, b) => b.count - a.count || a.goalTitle.localeCompare(b.goalTitle))

        // Dependency signal: foundational subgoals this week's completed work
        // advanced. The engine returns ids in leverage order; resolve each to its
        // title via the lineages already fetched (the ids are a subset of the
        // completed tasks' subgoals, so they are present — fall back if dangling).
        const completedSubgoalIds = new Set(completedSubgoals.map((s) => s.id))
        const strengthenedFoundations: StrengthenedFoundationNote[] =
          computeStrengthenedFoundations(
            review.completedTasks,
            subgoalEdges,
            completedSubgoalIds,
          ).map((f) => ({
            subgoalTitle: lineages[f.subgoalId]?.subgoalTitle ?? 'a subgoal',
            activeSupportCount: f.activeSupportCount,
          }))

        set({
          weeklyReview: { ...review, completedByGoal, strengthenedFoundations },
          error: null,
        })
      } catch {
        set({ error: LOAD_ERROR_MESSAGE })
      } finally {
        set({ isLoadingReview: false })
      }
    },

    // --- roadmap ---
    currentRoadmap: null,
    isLoadingRoadmap: false,

    // Assemble the dependency-ordered roadmap for ONE goal. Read-only: it never
    // mutates the graph (editing lives on the Goal Detail page). Fetches this
    // goal's subgoals, the subgoal dependency graph, and which subgoals are
    // complete — the SAME three inputs refreshTopPriority already uses — then the
    // pure engine orders them and the store joins the resulting ids back to
    // Subgoal objects for the UI. Mirrors loadGoalTree: it flips the loading flag
    // for the first paint, and stamps the result with goalId so the page can tell
    // a freshly-loaded roadmap from a previous goal's still on screen.
    loadRoadmap: async (goalId) => {
      set({ isLoadingRoadmap: true })
      try {
        const [subgoals, subgoalEdges, completedSubgoals] = await Promise.all([
          getSubgoalsByGoalId(goalId),
          getDependenciesByType('subgoal'),
          getSubgoalsByStatus('completed'),
        ])
        const completedIds = new Set(completedSubgoals.map((s) => s.id))
        const layout = buildRoadmap(
          subgoals.map((s) => s.id),
          subgoalEdges,
          completedIds,
        )

        // Resolve the engine's ids back to this goal's Subgoal objects. Ids in
        // the layout always come from `subgoals`, so every lookup hits — the
        // filter is just to satisfy the type, never to drop real data.
        const byId = new Map(subgoals.map((s) => [s.id, s]))
        const resolve = (ids: ID[]): Subgoal[] => {
          const out: Subgoal[] = []
          for (const id of ids) {
            const subgoal = byId.get(id)
            if (subgoal) out.push(subgoal)
          }
          return out
        }

        const stations: RoadmapStation[] = []
        for (const id of layout.order) {
          const subgoal = byId.get(id)
          if (!subgoal) continue
          const node = layout.nodes[id]
          stations.push({
            subgoal,
            activeSupportCount: node.activeSupportCount,
            supportedBy: resolve(node.supportedByIds),
            supports: resolve(node.supportsIds),
          })
        }

        set({
          currentRoadmap: { goalId, stations, cyclic: layout.cyclic },
          error: null,
        })
      } catch {
        set({ error: LOAD_ERROR_MESSAGE })
      } finally {
        set({ isLoadingRoadmap: false })
      }
    },

    // --- AI assistance ---
    // Thin orchestration: build the prompt (pure), ask the provider (the only
    // thing that "calls out"), parse the reply (pure, never throws). No store
    // state is cached — the caller holds the returned suggestions while the user
    // accepts/edits/rejects them. A provider rejection bubbles up to the caller.
    suggestMilestones: async (context) => {
      const response = await aiProvider.complete(buildMilestonePrompt(context))
      return parseMilestoneSuggestions(response)
    },
  }
})