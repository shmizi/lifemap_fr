// useStrategyBrief — hands the Goal Detail View a goal's stored Strategy Brief
// without it ever touching a repository (Repository -> Store -> Hook -> UI). Same
// shape as useGoalTree / useRoadmap: it triggers a load on mount (and whenever the
// goal changes) and returns the cached brief plus its loading flag.
//
// The brief is a single store slot (currentStrategyBrief), one goal at a time — so
// this hook is only correct for the ONE goal currently on the Detail page, exactly
// like useGoalTree. Generating a brief (generateStrategyBrief) refreshes the same
// slot, so the panel updates without a re-load.

import { useEffect } from 'react'
import { useGoalStore } from '@/store/useGoalStore'

export function useStrategyBrief(goalId: string) {
  const brief = useGoalStore((s) => s.currentStrategyBrief)
  const isLoading = useGoalStore((s) => s.isLoadingStrategyBrief)
  const loadStrategyBrief = useGoalStore((s) => s.loadStrategyBrief)

  useEffect(() => {
    if (goalId) void loadStrategyBrief(goalId)
  }, [goalId, loadStrategyBrief])

  return { brief, isLoading }
}
