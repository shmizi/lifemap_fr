// useUserContext — hands a view the loaded standing user context without it ever
// touching a repository. Same Repository -> Store -> Hook -> UI rule as useProfile.
//
// Returns the cached context, the loading flag, and whether setup has happened yet
// (the onboarding gate reads isSetup to decide whether to show the first-run flow).

import { useEffect } from 'react'
import { useContextStore } from '@/store/useContextStore'

export function useUserContext() {
  const userContext = useContextStore((s) => s.userContext)
  const isSetup = useContextStore((s) => s.isUserContextSetup)
  const isLoading = useContextStore((s) => s.isLoadingUserContext)
  const loadUserContext = useContextStore((s) => s.loadUserContext)

  // Load once on mount. loadUserContext is a stable store action, safe in deps.
  useEffect(() => {
    void loadUserContext()
  }, [loadUserContext])

  return { userContext, isSetup, isLoading }
}
