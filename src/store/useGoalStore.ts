// Tracks which goal the user is currently viewing/editing.
// Will grow significantly in Phase 1 when goal CRUD is added.

import { create } from 'zustand'
import type { ID } from '@/core/types'

interface GoalState {
  selectedGoalId: ID | null
  setSelectedGoalId: (id: ID | null) => void
  clearSelectedGoal: () => void
}

export const useGoalStore = create<GoalState>()((set) => ({
  selectedGoalId: null,
  setSelectedGoalId: (id) => set({ selectedGoalId: id }),
  clearSelectedGoal: () => set({ selectedGoalId: null }),
}))
