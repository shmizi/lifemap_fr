// RoadmapView — renders one goal's dependency-ordered subgoals as a vertical
// route of stations (Phase 4).
//
// WHY it stays dumb: it receives a fully-resolved RoadmapView (subgoals already
// joined to their supporters, ordered by the engine) and only lays it out. No
// fetching, no graph math, no editing — comprehension only. The empty and
// cyclic states are calm notes, never blockers (soft-dependency model).

import { Link } from 'react-router-dom'
import type { RoadmapView as RoadmapViewModel } from '@/store/useGoalStore'
import { goalDetailPath } from '@/core/constants'
import { RoadmapStationCard } from './RoadmapStationCard'

interface RoadmapViewProps {
  view: RoadmapViewModel
}

export function RoadmapView({ view }: RoadmapViewProps) {
  if (view.stations.length === 0) {
    return (
      <div className="mt-6 rounded-app-lg border border-dashed border-app-border bg-app-surface p-8 text-center">
        <p className="text-sm text-app-text-muted">
          This goal has no subgoals yet. Break it into parts on its{' '}
          <Link
            to={goalDetailPath(view.goalId)}
            className="text-app-text underline-offset-2 hover:underline"
          >
            detail page
          </Link>{' '}
          to see them mapped here.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-6">
      {/* A loop has no single "build order"; we still show every subgoal (soft
          model) and just name the situation gently. */}
      {view.cyclic ? (
        <p className="mb-4 rounded-app border border-app-border bg-app-surface-alt px-3 py-2 text-xs text-app-text-muted">
          Some subgoals support each other in a loop, so there is no single order.
          They are listed after the ones that do have a clear sequence.
        </p>
      ) : null}

      <ol className="relative">
        {view.stations.map((station, index) => (
          <RoadmapStationCard
            key={station.subgoal.id}
            station={station}
            index={index}
            isLast={index === view.stations.length - 1}
          />
        ))}
      </ol>

      <p className="mt-4 text-xs text-app-text-muted">
        Order reflects which subgoals support others. Add or change these soft
        links on each goal&apos;s detail page.
      </p>
    </div>
  )
}
