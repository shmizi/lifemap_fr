// Dependency store — the single place the UI reads dependency-graph state from,
// and the only place (besides repositories) that orchestrates dependency writes.
//
// Locked data flow: Database -> Repositories -> Engine -> Store -> Hook -> UI.
// Kept SEPARATE from useGoalStore on purpose: dependencies are a graph concern
// (edges + ordering + cycle checks), distinct from the goal-tree hierarchy that
// store owns. Repositories supply the edges; the engine (topologicalSort /
// wouldCreateCycle) does the graph math; this store only orchestrates and caches.
//
// One graph at a time: task ids and subgoal ids are disjoint, so each Dependency
// `type` ('task' | 'subgoal') is its own self-contained graph. The store holds
// exactly one loaded graph (mirroring how useGoalStore holds one currentGoalTree),
// tracked by `loadedType`.
//
// SCOPE (Phase 3, store wiring): create + read + order only. removeDependency
// removes a SINGLE edge a user explicitly deletes — that is the inverse of
// addDependency, not the unresolved "what happens to edges when an ENTITY is
// deleted" product question. No goal/subgoal/task delete path is wired to touch
// dependency rows here; that stays deferred until the product decision is made.

import { create } from 'zustand'
import type { Dependency, ID } from '@/core/types'
import {
  createDependency,
  deleteDependency,
  getDependenciesByType,
  type CreateDependencyInput,
} from '@/database/repositories'
import { topologicalSort } from '@/engine/dependencies/topologicalSort'
import { wouldCreateCycle } from '@/engine/dependencies/detectCycle'

// One graph kind. Sourced from the canonical type so it never drifts.
export type DependencyType = Dependency['type']

// addDependency outcome. A cycle is an EXPECTED user-level rejection (the edge
// would make the graph impossible to satisfy), not an exception — so it is
// reported as data the UI can act on, not thrown.
export type AddDependencyResult =
  | { ok: true; dependency: Dependency }
  | { ok: false; reason: 'cycle' }

interface DependencyState {
  // The loaded graph's edges, the kind they belong to, and the derived ordering.
  // `order` and `cyclic` come straight from the engine over `dependencies`; the
  // store never computes them inline. They are recomputed together every time the
  // edge set changes so an edge list and its ordering can never disagree.
  dependencies: Dependency[]
  loadedType: DependencyType | null
  order: ID[]
  cyclic: boolean
  isLoadingDependencies: boolean

  loadDependencies: (type: DependencyType) => Promise<void>
  addDependency: (input: CreateDependencyInput) => Promise<AddDependencyResult>
  removeDependency: (id: ID) => Promise<void>
}

export const useDependencyStore = create<DependencyState>()((set, get) => {
  // Set the loaded graph + its derived ordering in one shot, so the three always
  // agree. topologicalSort yields both the order and whether a cycle left some
  // nodes unorderable.
  const applyGraph = (type: DependencyType, edges: Dependency[]): void => {
    const { order, cyclic } = topologicalSort(edges)
    set({ dependencies: edges, loadedType: type, order, cyclic })
  }

  // Re-fetch the currently loaded graph in place (no loading-flag flip -> no
  // flicker), mirroring useGoalStore's refreshCurrentTree. No-op when nothing is
  // loaded yet. Called after a mutation that affects the loaded graph.
  const refreshLoaded = async (): Promise<void> => {
    const type = get().loadedType
    if (type === null) return
    applyGraph(type, await getDependenciesByType(type))
  }

  return {
    dependencies: [],
    loadedType: null,
    order: [],
    cyclic: false,
    isLoadingDependencies: false,

    // Load one graph kind and derive its ordering. Flips the loading flag for the
    // first paint (use after navigating to a graph view), like loadGoalTree.
    loadDependencies: async (type) => {
      set({ isLoadingDependencies: true })
      try {
        applyGraph(type, await getDependenciesByType(type))
      } finally {
        set({ isLoadingDependencies: false })
      }
    },

    // Guard then create. The guard runs against the AUTHORITATIVE current edges
    // of the input's kind (freshly fetched, not the possibly-stale loaded set),
    // so a cycle is caught regardless of which graph is on screen. Only refresh
    // the on-screen view when the new edge belongs to the loaded graph.
    addDependency: async (input) => {
      const existing = await getDependenciesByType(input.type)
      if (wouldCreateCycle(existing, input.fromId, input.toId)) {
        return { ok: false, reason: 'cycle' }
      }
      const dependency = await createDependency(input)
      if (input.type === get().loadedType) await refreshLoaded()
      return { ok: true, dependency }
    },

    // Remove a single edge the user explicitly deletes (inverse of addDependency).
    // Idempotent on an unknown id (the repository's delete is). Refreshes the
    // on-screen graph if one is loaded.
    removeDependency: async (id) => {
      await deleteDependency(id)
      await refreshLoaded()
    },
  }
})
