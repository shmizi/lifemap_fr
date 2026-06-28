// useLifeMap — hands the Dashboard the cross-goal "living map" without the page
// touching a repository or the engine.
//
// Same Repository -> Engine -> Store -> Hook -> UI rule as useRoadmap: the store
// owns the assembled map (geometry from the pure layout engine, state joined from
// live data) and this hook just triggers the load and reads the cached result.
// Unlike useRoadmap it takes no goalId — the map spans every goal at once.

import { useEffect } from 'react'
import { useGoalStore } from '@/store/useGoalStore'

export function useLifeMap() {
  const lifeMap = useGoalStore((s) => s.lifeMap)
  const isLoading = useGoalStore((s) => s.isLoadingLifeMap)
  const loadLifeMap = useGoalStore((s) => s.loadLifeMap)

  // Load once on mount; loadLifeMap is a stable store action, safe in deps.
  useEffect(() => {
    void loadLifeMap()
  }, [loadLifeMap])

  return { lifeMap, isLoading }
}
