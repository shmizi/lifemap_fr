// Goal store — the single place the UI reads goal-list and goal-tree state from.
//
// WHY this now holds data and not just a selected id:
// The locked data flow is Database -> Repositories -> Store action -> Hook -> UI.
// UI components must never import a repository directly, so the store is where
// repository calls are kicked off and their results are cached for the UI to read.
//
// Scope is kept deliberately small (per the architecture rules):
//   - goals[]          : the flat list shown on the Goals page
//   - selectedGoalId   : which goal the user is focused on
//   - currentGoalTree  : the assembled read-only tree for the Goal Detail View
// No derived / health / priority values are stored here — those are computed in
// the engine layer in later phases, never cached as state.

import { create } from 'zustand'
import type { Goal, GoalTree, ID } from '@/core/types'
import { getAllGoals, createGoal, getGoalTree } from '@/database/repositories'

// The shape of a brand-new goal as supplied by the creation form. The repository
// owns id + timestamps, so the caller never provides them.
export type NewGoalInput = Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>

interface GoalState {
  // --- goal list ---
  goals: Goal[]
  isLoadingGoals: boolean
  loadGoals: () => Promise<void>
  addGoal: (input: NewGoalInput) => Promise<Goal>

  // --- selection ---
  selectedGoalId: ID | null
  setSelectedGoalId: (id: ID | null) => void
  clearSelectedGoal: () => void

  // --- goal tree (consumed by the Goal Detail View via useGoalTree) ---
  currentGoalTree: GoalTree | null
  isLoadingTree: boolean
  loadGoalTree: (id: ID) => Promise<void>
}

export const useGoalStore = create<GoalState>()((set) => ({
  // --- goal list ---
  goals: [],
  isLoadingGoals: false,

  // WHY refetch the whole list instead of mutating in place: the list is tiny
  // (one user's goals) and getAllGoals already returns them newest-first, so a
  // reload is simpler and guarantees the order/contents match the database
  // exactly rather than us keeping a parallel copy in sync.
  loadGoals: async () => {
    set({ isLoadingGoals: true })
    try {
      const goals = await getAllGoals()
      set({ goals })
    } finally {
      set({ isLoadingGoals: false })
    }
  },

  // Create then reload, so the new goal lands in the same sorted position the
  // database would give it. Returns the created goal so the caller (the modal)
  // can react — e.g. close itself or select the new goal.
  addGoal: async (input) => {
    const goal = await createGoal(input)
    const goals = await getAllGoals()
    set({ goals })
    return goal
  },

  // --- selection ---
  selectedGoalId: null,
  setSelectedGoalId: (id) => set({ selectedGoalId: id }),
  clearSelectedGoal: () => set({ selectedGoalId: null }),

  // --- goal tree ---
  currentGoalTree: null,
  isLoadingTree: false,

  // Establishes the Repository -> Store -> Hook -> UI path the Detail View (next
  // session) will use. We clear the previous tree before loading so a stale tree
  // from a different goal never flashes while the new one is in flight.
  // getGoalTree returns undefined for an unknown id; we normalise that to null.
  loadGoalTree: async (id) => {
    set({ isLoadingTree: true, currentGoalTree: null })
    try {
      const tree = await getGoalTree(id)
      set({ currentGoalTree: tree ?? null })
    } finally {
      set({ isLoadingTree: false })
    }
  },
}))