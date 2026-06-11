// useGoalTree — hands a component the assembled GoalTree for one goal without
// the component ever touching a repository.
//
// WHY a hook on top of the store: the data lives in the store (preserving the
// Repository -> Store -> Hook -> UI path), but a component should not have to
// remember to call loadGoalTree in an effect and pull three fields out of the
// store every time. The hook encapsulates that: pass a goalId, get back
// { tree, isLoading }. The Goal Detail View (next session) becomes trivial:
//   const { tree, isLoading } = useGoalTree(id)
//
// NOTE: currentGoalTree is single-slot shared state, which is correct here
// because the app only ever shows one goal detail at a time. It is not built to
// hold several trees at once.

import { useEffect } from 'react'
import type { ID } from '@/core/types'
import { useGoalStore } from '@/store/useGoalStore'

export function useGoalTree(goalId: ID) {
  const tree = useGoalStore((s) => s.currentGoalTree)
  const isLoading = useGoalStore((s) => s.isLoadingTree)
  const loadGoalTree = useGoalStore((s) => s.loadGoalTree)

  // Reload whenever the goalId changes (e.g. navigating between detail pages).
  // loadGoalTree is a stable store action, so it is safe in the dependency array.
  useEffect(() => {
    void loadGoalTree(goalId)
  }, [goalId, loadGoalTree])

  return { tree, isLoading }
}
