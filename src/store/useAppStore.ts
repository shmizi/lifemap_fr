// Holds the user's profile — name, available hours/day, timezone.
// Profile is null until the user completes onboarding (Phase 5+).
// For now it's just a data shape, not connected to any storage.

import { create } from 'zustand'
import type { UserProfile } from '@/core/types'

interface AppState {
  userProfile: UserProfile | null
  isProfileSetup: boolean
  setUserProfile: (profile: UserProfile) => void
  clearProfile: () => void
}

export const useAppStore = create<AppState>()((set) => ({
  userProfile: null,
  isProfileSetup: false,
  setUserProfile: (profile) => set({ userProfile: profile, isProfileSetup: true }),
  clearProfile: () => set({ userProfile: null, isProfileSetup: false }),
}))
