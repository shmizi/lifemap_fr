// useProfile — hands the Settings page the loaded user profile without it ever
// touching a repository.
//
// Same Repository -> Store -> Hook -> UI rule as useOpportunities / useRoadmap:
// the store owns the loaded profile and the save logic; this hook triggers the
// initial load and reads the cached result. Returns { profile, isLoading }.

import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'

export function useProfile() {
  const profile = useAppStore((s) => s.userProfile)
  const isLoading = useAppStore((s) => s.isLoadingProfile)
  const loadProfile = useAppStore((s) => s.loadProfile)

  // Load once on mount. loadProfile is a stable store action, safe in deps.
  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  return { profile, isLoading }
}
