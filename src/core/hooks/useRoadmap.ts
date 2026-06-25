// useRoadmap — hands the Roadmap page the dependency-ordered roadmap for one
// goal without the page ever touching a repository or the engine.
//
// WHY a hook on top of the store: same rationale as useGoalTree / useGoalStore.
// The data lives in the store (preserving Repository -> Engine -> Store -> Hook
// -> UI), and the store does the join from edge-ids to Subgoal objects. The hook
// just triggers the load and reads the cached result: pass a goalId, get back
// { roadmap, isLoading }.
//
// NOTE: currentRoadmap is single-slot shared state (like currentGoalTree), which
// is correct because the page shows one goal's roadmap at a time. An empty goalId
// (nothing selected yet) is a no-op — the page renders its own "pick a goal"
// prompt and never asks for a roadmap until a goal exists.

import { useEffect } from 'react'
import type { ID } from '@/core/types'
import { useGoalStore } from '@/store/useGoalStore'

export function useRoadmap(goalId: ID) {
  const roadmap = useGoalStore((s) => s.currentRoadmap)
  const isLoading = useGoalStore((s) => s.isLoadingRoadmap)
  const loadRoadmap = useGoalStore((s) => s.loadRoadmap)

  // Reload whenever the selected goal changes. loadRoadmap is a stable store
  // action, so it is safe in the dependency array.
  useEffect(() => {
    if (!goalId) return
    void loadRoadmap(goalId)
  }, [goalId, loadRoadmap])

  return { roadmap, isLoading }
}
