// useOpportunities — hands a Discovery view the saved opportunity catalogue
// without the page ever touching a repository or the engine.
//
// WHY a hook on top of the store: the same Repository -> Engine -> Store -> Hook
// -> UI rule the rest of the app follows (cf. useRoadmap). The store owns the
// loaded list and the score-on-save logic; this hook just triggers the initial
// load and reads the cached result: get back { opportunities, isLoading }.

import { useEffect } from 'react'
import { useDiscoveryStore } from '@/store/useDiscoveryStore'

export function useOpportunities() {
  const opportunities = useDiscoveryStore((s) => s.opportunities)
  const isLoading = useDiscoveryStore((s) => s.isLoadingOpportunities)
  const loadOpportunities = useDiscoveryStore((s) => s.loadOpportunities)

  // Load once on mount. loadOpportunities is a stable store action, safe in deps.
  useEffect(() => {
    void loadOpportunities()
  }, [loadOpportunities])

  return { opportunities, isLoading }
}
