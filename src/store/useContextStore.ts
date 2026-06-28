// Context store (Phase 9) — the AI-personalization context the rest of the app
// reads and writes: the user's standing "about me" (single row) and per-goal
// intake (one row per goal).
//
// WHY a SEPARATE store (the 6th), not folded into useAppStore: the user asked to
// keep this concern apart from the canonical profile, and it mirrors the existing
// precedent of a focused store per concern (useDependencyStore, useDiscoveryStore).
// Same data flow as everywhere else: DB -> Repositories -> Store -> Hook -> UI.
// This store NEVER touches the database directly — only contextRepository does.
//
// The standing userContext is CACHED here (a single slot, like the profile),
// because the dashboard greeting / Settings / AI prompts all read the one row.
// Per-goal context is NOT cached as a slot — there are many goals — so it is
// fetched on demand by the goal create/edit modal and written through saveGoalContext.

import { create } from 'zustand'
import type { UserContext, GoalContext, ID } from '@/core/types'
import {
  getUserContext,
  saveUserContext as saveUserContextRow,
  getGoalContext,
  saveGoalContext as saveGoalContextRow,
  type SaveUserContextInput,
  type SaveGoalContextInput,
} from '@/database/repositories'

interface ContextState {
  // The loaded standing context, or null before one has ever been saved.
  userContext: UserContext | null
  // True once a userContext row exists — the onboarding gate shows ONLY while
  // this is false (distinct from a context whose fields happen to be empty).
  isUserContextSetup: boolean
  isLoadingUserContext: boolean

  // Load the standing context from storage (use on mount of a view that needs it,
  // and the onboarding gate).
  loadUserContext: () => Promise<void>
  // Upsert the standing context and cache the saved row. Marks setup complete.
  saveUserContext: (input: SaveUserContextInput) => Promise<UserContext>

  // Per-goal intake — fetched on demand (not cached as a single slot, since many
  // goals exist). The goal modal reads this when editing, writes it on save.
  fetchGoalContext: (goalId: ID) => Promise<GoalContext | undefined>
  saveGoalContext: (input: SaveGoalContextInput) => Promise<GoalContext>
}

export const useContextStore = create<ContextState>()((set) => ({
  userContext: null,
  isUserContextSetup: false,
  // Starts true: we have not read storage yet, so consumers (notably the
  // onboarding gate) treat the state as "still loading" until the first
  // loadUserContext resolves — this prevents the gate flashing the first-run
  // modal for one frame before the existing context is known.
  isLoadingUserContext: true,

  loadUserContext: async () => {
    set({ isLoadingUserContext: true })
    try {
      const context = await getUserContext()
      set({
        userContext: context ?? null,
        isUserContextSetup: context !== undefined,
      })
    } finally {
      set({ isLoadingUserContext: false })
    }
  },

  saveUserContext: async (input) => {
    const saved = await saveUserContextRow(input)
    set({ userContext: saved, isUserContextSetup: true })
    return saved
  },

  // Read-through: the goal modal calls this on open (edit mode) to seed its intake
  // fields. Returns undefined for a goal with no captured context yet.
  fetchGoalContext: async (goalId) => getGoalContext(goalId),

  // Write-through: no cached slot to update, so this just persists. The goal modal
  // calls it after addGoal/editGoal with the new goalId.
  saveGoalContext: async (input) => saveGoalContextRow(input),
}))
