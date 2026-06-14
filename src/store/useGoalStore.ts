// Goal store — the single place the UI reads goal-list and goal-tree state from,
// and the only place (besides repositories) that orchestrates writes.
//
// Locked data flow: Database -> Repositories -> Store action -> Hook -> UI.
// UI components never import a repository directly; they call these actions.
//
// State kept deliberately small:
//   - goals[]          : the flat list shown on the Goals page
//   - selectedGoalId   : which goal the user is focused on
//   - currentGoalTree  : the assembled read-only tree for the Goal Detail View
// No derived/health/priority values are cached here — those are engine concerns
// in later phases.

import { create } from 'zustand'
import type { Goal, Subgoal, Milestone, Task, GoalTree, ID } from '@/core/types'
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
  createMilestone,
  updateMilestone,
  deleteMilestone,
  getTasksBySubgoalId,
  createTask,
  updateTask,
  deleteTask,
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

interface GoalState {
  // --- goal list ---
  goals: Goal[]
  isLoadingGoals: boolean
  loadGoals: () => Promise<void>
  addGoal: (input: NewGoalInput) => Promise<Goal>
  editGoal: (id: ID, changes: GoalChanges) => Promise<void>
  removeGoal: (id: ID) => Promise<void>

  // --- selection ---
  selectedGoalId: ID | null
  setSelectedGoalId: (id: ID | null) => void
  clearSelectedGoal: () => void

  // --- goal tree (consumed by the Goal Detail View via useGoalTree) ---
  currentGoalTree: GoalTree | null
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
}

export const useGoalStore = create<GoalState>()((set, get) => {
  // Re-fetch the on-screen goal's tree in place (no loading flash). Called after
  // any subgoal/milestone/task mutation so the Detail View reflects it. Reads
  // the goal id from the currently-loaded tree, since every such mutation
  // happens while that goal is on screen.
  const refreshCurrentTree = async () => {
    const goalId = get().currentGoalTree?.goal.id
    if (goalId) {
      const tree = await getGoalTree(goalId)
      set({ currentGoalTree: tree ?? null })
    }
  }

  // Next display position among a set of siblings: max(order)+1, which is
  // collision-proof even if the existing orders have gaps.
  const nextOrder = (orders: number[]): number =>
    orders.length === 0 ? 0 : Math.max(...orders) + 1

  return {
    // --- goal list ---
    goals: [],
    isLoadingGoals: false,

    loadGoals: async () => {
      set({ isLoadingGoals: true })
      try {
        set({ goals: await getAllGoals() })
      } finally {
        set({ isLoadingGoals: false })
      }
    },

    addGoal: async (input) => {
      const goal = await createGoal(input)
      set({ goals: await getAllGoals() })
      return goal
    },

    editGoal: async (id, changes) => {
      await updateGoal(id, changes)
      set({ goals: await getAllGoals() })
      // If this goal is the one open in the Detail View, refresh its tree too.
      if (get().currentGoalTree?.goal.id === id) await refreshCurrentTree()
    },

    // TODO(Phase 3): cascade. deleteGoal removes only the goal row, not its
    // descendants/dependencies. Safe to leave until the dependency engine exists.
    removeGoal: async (id) => {
      await deleteGoal(id)
      set({ goals: await getAllGoals() })
    },

    // --- selection ---
    selectedGoalId: null,
    setSelectedGoalId: (id) => set({ selectedGoalId: id }),
    clearSelectedGoal: () => set({ selectedGoalId: null }),

    // --- goal tree ---
    currentGoalTree: null,
    isLoadingTree: false,

    // Blanks the tree first (avoids a stale-goal flash when navigating between
    // detail pages); in-place refreshes after a mutation use refreshCurrentTree.
    loadGoalTree: async (id) => {
      set({ isLoadingTree: true, currentGoalTree: null })
      try {
        const tree = await getGoalTree(id)
        set({ currentGoalTree: tree ?? null })
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
      await refreshCurrentTree()
      return task
    },
    editTask: async (id, changes) => {
      await updateTask(id, changes)
      await refreshCurrentTree()
    },
    removeTask: async (id) => {
      await deleteTask(id)
      await refreshCurrentTree()
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
      await refreshCurrentTree()
    },
  }
})