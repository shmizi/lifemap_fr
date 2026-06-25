// useDependencyGraph — hands a component one dependency graph (its edges plus
// the engine-derived topological order and cycle flag) without the component
// ever touching a repository or the engine.
//
// WHY a hook on top of the store: same rationale as useGoalTree. The data lives
// in the store (preserving Repository -> Engine -> Store -> Hook -> UI), but a
// component should not have to remember to call loadDependencies in an effect
// and pull four fields out of the store. Pass a type, get back
// { dependencies, order, cyclic, isLoading }.
//
// NOTE: the store holds ONE graph at a time (single-slot, like currentGoalTree),
// which is correct because the app shows one dependency view at a time. It is
// not built to hold the task-graph and subgoal-graph simultaneously.

import { useEffect } from 'react'
import { useDependencyStore, type DependencyType } from '@/store/useDependencyStore'

// reloadKey: an optional value the caller changes to FORCE a reload of the graph.
// The dependency store is intentionally separate from useGoalStore, so when an
// entity delete in useGoalStore cascade-removes edges from the DB out-of-band,
// this store doesn't hear about it. A caller that knows the underlying entities
// changed (e.g. the Goal Detail page, keyed on its subgoal ids) bumps reloadKey
// to pull fresh edges and drop any now-dangling ones.
export function useDependencyGraph(type: DependencyType, reloadKey?: string) {
  const dependencies = useDependencyStore((s) => s.dependencies)
  const order = useDependencyStore((s) => s.order)
  const cyclic = useDependencyStore((s) => s.cyclic)
  const isLoading = useDependencyStore((s) => s.isLoadingDependencies)
  const loadDependencies = useDependencyStore((s) => s.loadDependencies)

  // Reload when the graph kind changes OR the caller's reloadKey changes.
  // loadDependencies is a stable store action, so it is safe in the dep array.
  useEffect(() => {
    void loadDependencies(type)
  }, [type, loadDependencies, reloadKey])

  return { dependencies, order, cyclic, isLoading }
}
