// RoadmapStationNode — one subgoal as a "station" pill on the metro-map roadmap
// (Phase 4 visual pass).
//
// WHY an HTML pill (not SVG text): titles need clean truncation and the app's
// theme tokens, both awkward in raw SVG <text>. RoadmapView positions these pills
// absolutely over an SVG layer that draws the "supports" lines between them — the
// hybrid keeps labels crisp and on-theme while the connections stay smooth.
//
// READ-ONLY presentation: it renders the resolved station it is given. Editing
// the graph stays on the Goal Detail page. The supporters/supported titles ride
// along in the `title` tooltip so the information the lines imply is still
// available on hover and to assistive tech.

import type { RoadmapStation } from '@/store/useGoalStore'
import { SUBGOAL_STATUS_LABELS } from '@/core/constants'

interface RoadmapStationNodeProps {
  station: RoadmapStation
}

export function RoadmapStationNode({ station }: RoadmapStationNodeProps) {
  const { subgoal, activeSupportCount, supportedBy, supports } = station
  const isComplete = subgoal.status === 'completed'

  // A plain-text summary of the connections the lines draw, for hover + a11y.
  const tooltip = [
    supportedBy.length > 0
      ? `Supported by ${supportedBy.map((s) => s.title).join(', ')}`
      : null,
    supports.length > 0
      ? `Supports ${supports.map((s) => s.title).join(', ')}`
      : null,
  ]
    .filter((line): line is string => line !== null)
    .join(' · ')

  return (
    <div
      title={tooltip || undefined}
      className={`flex h-full w-full items-center gap-2.5 border bg-app-surface px-3 ${
        isComplete ? 'border-app-text' : 'border-app-border'
      }`}
    >
      {/* Status mark: a finished station is a filled ink square; an in-progress
          one is a hollow outline. Monochrome — the register carries no pigment. */}
      <span
        className={`h-2 w-2 shrink-0 ${
          isComplete ? 'bg-app-text' : 'border border-app-text-muted'
        }`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-app-text">
          {subgoal.title}
        </span>
        {/* Mirror the dashboard's leverage caption when this station is
            foundational; otherwise just name its status. */}
        <span className="block truncate font-mono text-[10px] uppercase tracking-[0.1em] text-app-text-muted">
          {activeSupportCount > 0
            ? `Supports ${activeSupportCount} active`
            : SUBGOAL_STATUS_LABELS[subgoal.status]}
        </span>
      </span>
    </div>
  )
}
