// SubgoalDependencies — the "Depends on" panel for one subgoal on the Goal
// Detail page (Phase 3, first dependency UI).
//
// SOFT semantics: a dependency here means "this subgoal is supported/
// strengthened by another," NOT "the other must finish first." It is purely
// informational and never gates starting or completing anything — there is no
// disabled state, no blocking. (Hard prerequisites are a future, exceptional
// case, not this.) The edge direction matches the data model: an edge
// fromId -> toId reads "fromId supports toId", so this subgoal's supporters are
// the edges whose toId is this subgoal.
//
// Pure-ish presentation: it reads the already-loaded subgoal graph (passed in by
// the page) and the goal's subgoals for the picker, and calls the dependency
// store to add/remove an edge. The store runs the cycle guard; a rejected add is
// surfaced as a calm inline message, never a thrown error.

import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import type { Dependency, ID } from '@/core/types'
import { useDependencyStore } from '@/store/useDependencyStore'

interface SubgoalRef {
  id: ID
  title: string
}

interface SubgoalDependenciesProps {
  subgoalId: ID
  // Every subgoal in this goal (including this one); used for the picker and to
  // resolve a supporter's id to its title.
  allSubgoals: SubgoalRef[]
  // All loaded subgoal-type edges (the global subgoal graph). This subgoal's
  // supporters are filtered out of it by toId.
  edges: Dependency[]
}

export function SubgoalDependencies({
  subgoalId,
  allSubgoals,
  edges,
}: SubgoalDependenciesProps) {
  const addDependency = useDependencyStore((s) => s.addDependency)
  const removeDependency = useDependencyStore((s) => s.removeDependency)

  const [selectedId, setSelectedId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const titleOf = (id: ID): string =>
    allSubgoals.find((s) => s.id === id)?.title ?? 'Unknown subgoal'

  // Edges that support THIS subgoal (its prerequisites, in the soft sense).
  const supporters = edges.filter((e) => e.toId === subgoalId)
  const supporterIds = new Set(supporters.map((e) => e.fromId))

  // Picker candidates: every other subgoal not already a supporter. Soft model,
  // so we don't try to pre-empt cycles in the list — the store's guard catches a
  // loop on submit and we explain it inline.
  const candidates = allSubgoals.filter(
    (s) => s.id !== subgoalId && !supporterIds.has(s.id),
  )

  // Nothing to show and nothing addable -> render nothing, keeping the card calm
  // (e.g. a goal with a single subgoal).
  if (supporters.length === 0 && candidates.length === 0) return null

  async function handleAdd() {
    if (selectedId === '') return
    setError(null)
    const result = await addDependency({
      fromId: selectedId,
      toId: subgoalId,
      type: 'subgoal',
    })
    if (!result.ok) {
      setError('That would create a circular dependency.')
      return
    }
    setSelectedId('')
  }

  return (
    <div className="border-t border-app-border pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-app-text-muted">
        Depends on
      </p>
      <p className="mt-0.5 text-xs text-app-text-muted">
        Subgoals that strengthen this one. A soft link, not a blocker — you can
        work on them in any order.
      </p>

      {supporters.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {supporters.map((edge) => (
            <li
              key={edge.id}
              className="group/dep flex items-center gap-2 rounded-app border border-app-border bg-app-surface-alt px-2.5 py-1.5"
            >
              <span className="flex-1 text-sm text-app-text">
                {titleOf(edge.fromId)}
              </span>
              <button
                type="button"
                onClick={() => removeDependency(edge.id)}
                aria-label={`Remove dependency on ${titleOf(edge.fromId)}`}
                className="rounded-md p-0.5 text-app-text-muted opacity-0 transition hover:text-red-600 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-app-text/30 group-hover/dep:opacity-100"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {candidates.length > 0 ? (
        <div className="mt-2 flex items-center gap-2">
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value)
              setError(null)
            }}
            aria-label="Add a subgoal this one depends on"
            className="flex-1 rounded-app border border-app-border bg-app-surface px-2.5 py-1.5 text-sm text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          >
            <option value="">Add a dependency...</option>
            {candidates.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={selectedId === ''}
            className="inline-flex items-center gap-1.5 rounded-app-lg border border-app-border px-3 py-1.5 text-xs font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30 disabled:opacity-50"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
