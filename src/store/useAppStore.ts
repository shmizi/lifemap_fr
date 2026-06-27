// App store — the user's profile (name, available hours/day, timezone), loaded
// from and saved to the single-row `profile` table via the profile repository.
//
// Data flow (Phase 7 — Settings wired it to storage): the Settings form reads the
// loaded profile through useProfile and calls saveProfile here, which persists via
// the repository and caches the result. The store never touches the database
// directly — only the repository does (DB -> Repositories -> Store -> Hook -> UI).

import { create } from 'zustand'
import type { UserProfile } from '@/core/types'
import {
  getProfile,
  saveProfile as saveProfileRow,
  type SaveProfileInput,
} from '@/database/repositories'

interface AppState {
  // The loaded profile, or null before one has ever been saved (first-time setup).
  userProfile: UserProfile | null
  // True once a profile row exists in storage — distinguishes "not set up yet"
  // from a profile whose fields happen to be empty.
  isProfileSetup: boolean
  isLoadingProfile: boolean

  // Load the profile from storage (use on mount of a view that needs it).
  loadProfile: () => Promise<void>
  // Upsert the profile and cache the saved row. Returns it for the caller.
  saveProfile: (input: SaveProfileInput) => Promise<UserProfile>
}

export const useAppStore = create<AppState>()((set) => ({
  userProfile: null,
  isProfileSetup: false,
  isLoadingProfile: false,

  loadProfile: async () => {
    set({ isLoadingProfile: true })
    try {
      const profile = await getProfile()
      set({
        userProfile: profile ?? null,
        isProfileSetup: profile !== undefined,
      })
    } finally {
      set({ isLoadingProfile: false })
    }
  },

  saveProfile: async (input) => {
    const saved = await saveProfileRow(input)
    set({ userProfile: saved, isProfileSetup: true })
    return saved
  },
}))
