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
import { isMilestoneComplete } from '@/engine/progress/isMilestoneComplete'
import { rankTasks } from '@/engine/priority/rankTasks'
import {
  computeWeeklyReview,
  type WeeklyReviewData,
} from '@/engine/review/computeWeeklyReview'
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
} from '@/database/repositories'

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
export type WeeklyReview = WeeklyReviewData & {
  completedByGoal: CompletedGoalCount[]
}

interface GoalState {
  // --- goal list ---
  goals: Goal[]
  // Task-completion momentum per goal, keyed by goalId, computed by the engine
  // (never inline). Feeds the calm progress ring on each GoalCard. Refreshed
  // whenever the goal list is (re)loaded or a goal is added/edited/removed.
  goalProgress: Record<ID, GoalProgress>
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

  // Reload the goal list and recompute each goal's task-completion progress in
  // one pass, then set both together so a card and its ring never disagree. The
  // per-goal task fetch + engine math is the only place goalProgress is built;
  // every goal-list mutation routes through here. Cheap at this scale (tiny
  // tables); revisit if the goal/task counts ever grow large.
  const refreshGoalsAndProgress = async () => {
    const goals = await getAllGoals()
    const entries = await Promise.all(
      goals.map(async (goal): Promise<[ID, GoalProgress]> => {
        const tasks = await getTasksByGoalId(goal.id)
        return [goal.id, computeGoalProgress(tasks)]
      }),
    )
    set({ goals, goalProgress: Object.fromEntries(entries) })
  }

  // Recompute the dashboard's top-priority focus list. It ranks EVERY incomplete
  // task across ALL goals, so it gathers them by composing the existing getters
  // (getAllGoals + getTasksByGoalId) — no new repository query. rankTasks does
  // the scoring/sorting/top-N; the store never ranks inline. `new Date()` is read
  // once here so the whole list is scored against a single consistent "now".
  const refreshTopPriority = async () => {
    const goals = await getAllGoals()
    const tasksPerGoal = await Promise.all(
      goals.map((goal) => getTasksByGoalId(goal.id)),
    )
    set({ topPriorityTasks: rankTasks(tasksPerGoal.flat(), new Date()) })
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

  return {
    // --- goal list ---
    goals: [],
    goalProgress: {},
    isLoadingGoals: false,

    loadGoals: async () => {
      set({ isLoadingGoals: true })
      try {
        await refreshGoalsAndProgress()
      } finally {
        set({ isLoadingGoals: false })
      }
    },

    addGoal: async (input) => {
      const goal = await createGoal(input)
      await refreshGoalsAndProgress()
      return goal
    },

    editGoal: async (id, changes) => {
      await updateGoal(id, changes)
      await refreshGoalsAndProgress()
      // If this goal is the one open in the Detail View, refresh its tree too.
      if (get().currentGoalTree?.goal.id === id) await refreshCurrentTree()
    },

    // TODO(Phase 3): cascade. deleteGoal removes only the goal row, not its
    // descendants/dependencies. Safe to leave until the dependency engine exists.
    removeGoal: async (id) => {
      await deleteGoal(id)
      await refreshGoalsAndProgress()
    },

    // --- dashboard (today + overdue + upcoming) ---
    overdueTasks: [],
    todaysTasks: [],
    thisWeekTasks: [],
    taskLineages: {},
    todayEffort: { completed: 0, total: 0, percent: 0 },
    topPriorityTasks: [],
    isLoadingDashboard: false,

    // Initial load of the dashboard (flips the loading flag for the first paint).
    // Loads the scheduled-task windows, the cross-goal priority list, AND the
    // per-goal progress (for the Goal Progress snapshot) together. Each refresher
    // owns its own data source; refreshGoalsAndProgress is reused as-is so the
    // snapshot is populated on Dashboard mount, not only after a Goals-list visit.
    loadDashboard: async () => {
      set({ isLoadingDashboard: true })
      try {
        await Promise.all([
          refreshDashboard(),
          refreshTopPriority(),
          refreshGoalsAndProgress(),
        ])
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
        })
      } finally {
        set({ isLoadingTree: false })
      }
    },

    // --- subgoals ---
    addSubgoal: async (input) => {
      const siblings = await getSubgoalsByGoalId(input.goalId)
      const order = nextOrder(siblings.map((s) => s.order))
      const subgoal = await createSubgoal({ ...input, order })
      await refreshCurrentTree()
      return subgoal
    },
    editSubgoal: async (id, changes) => {
      await updateSubgoal(id, changes)
      await refreshCurrentTree()
    },
    // TODO(Phase 3): cascade delete milestones + tasks under this subgoal.
    removeSubgoal: async (id) => {
      await deleteSubgoal(id)
      await refreshCurrentTree()
    },

    // --- milestones ---
    addMilestone: async (input) => {
      const siblings = await getMilestonesBySubgoalId(input.subgoalId)
      const order = nextOrder(siblings.map((m) => m.order))
      const milestone = await createMilestone({ ...input, order })
      await refreshCurrentTree()
      return milestone
    },
    editMilestone: async (id, changes) => {
      await updateMilestone(id, changes)
      await refreshCurrentTree()
    },
    // TODO(Phase 3): cascade delete tasks under this milestone.
    removeMilestone: async (id) => {
      await deleteMilestone(id)
      await refreshCurrentTree()
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
      // dashboard windows, and the cross-goal priority list. One uniform
      // invariant — each refresher no-ops cheaply for a view that isn't mounted.
      await Promise.all([
        refreshCurrentTree(),
        refreshDashboard(),
        refreshTopPriority(),
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
      await Promise.all([
        refreshCurrentTree(),
        refreshDashboard(),
        refreshTopPriority(),
      ])
    },
    removeTask: async (id) => {
      // Removing a task can complete its milestone (if it was the last open
      // one). Read the milestone before the row is gone.
      const before = await getTaskById(id)
      await deleteTask(id)
      if (before?.milestoneId) await reconcileMilestone(before.milestoneId)
      await Promise.all([
        refreshCurrentTree(),
        refreshDashboard(),
        refreshTopPriority(),
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
      await Promise.all([
        refreshCurrentTree(),
        refreshDashboard(),
        refreshTopPriority(),
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
        const tasks = await getAllTasks()
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

        set({ weeklyReview: { ...review, completedByGoal } })
      } finally {
        set({ isLoadingReview: false })
      }
    },
  }
})