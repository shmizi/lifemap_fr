// RoadmapStationCard — one subgoal as a "station" on the goal's roadmap (Phase 4).
//
// WHY a station, not a flat card: the roadmap reads left-to-right / top-to-bottom
// as a route — a numbered node on a connecting line, with the subgoal beside it.
// This is the deliberately-lightweight first take on the "metro map" feel; it is
// the SAME data a richer SVG map would render later (see engine/roadmap), so the
// visual can be upgraded without reworking anything underneath.
//
// READ-ONLY: it shows supporters and how many active subgoals this one supports,
// but never edits the graph — creating/removing dependencies stays on the Goal
// Detail page. Pure presentation: it renders the resolved station it is given.

import type { RoadmapStation } from '@/store/useGoalStore'
import { SUBGOAL_STATUS_LABELS } from '@/core/constants'

interface RoadmapStationCardProps {
  station: RoadmapStation
  // 0-based position in dependency order; rendered 1-based as the station number.
  index: number
  // The last station draws no trailing connector line.
  isLast: boolean
}

export function RoadmapStationCard({
  station,
  index,
  isLast,
}: RoadmapStationCardProps) {
  const { subgoal, activeSupportCount, supportedBy } = station
  const isComplete = subgoal.status === 'completed'

  return (
    <li className="relative flex gap-4 pb-3 last:pb-0">
      {/* Left rail: the connecting "line" with a numbered node. self-stretch lets
          the line fill the full height of the (taller) station card beside it, so
          consecutive stations read as one continuous route. */}
      <div className="flex flex-col items-center self-stretch">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
            isComplete
              ? 'border-app-text bg-app-text text-app-surface'
              : 'border-app-border bg-app-surface text-app-text'
          }`}
        >
          {index + 1}
        </span>
        {!isLast ? (
          <span className="w-px flex-1 bg-app-border" aria-hidden="true" />
        ) : null}
      </div>

      {/* Station body */}
      <div className="flex-1 rounded-app-lg border border-app-border bg-app-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-app-text">{subgoal.title}</h3>
          <span className="shrink-0 rounded-full border border-app-border px-2 py-0.5 text-xs text-app-text-muted">
            {SUBGOAL_STATUS_LABELS[subgoal.status]}
          </span>
        </div>

        {/* The soft "prerequisites" — what strengthens this subgoal. */}
        {supportedBy.length > 0 ? (
          <p className="mt-2 text-xs text-app-text-muted">
            Supported by {supportedBy.map((s) => s.title).join(', ')}
          </p>
        ) : null}

        {/* Why this one is foundational — mirrors the dashboard's caption. */}
        {activeSupportCount > 0 ? (
          <p className="mt-1 text-xs text-app-text-muted">
            Supports {activeSupportCount} active subgoal
            {activeSupportCount === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>
    </li>
  )
}
