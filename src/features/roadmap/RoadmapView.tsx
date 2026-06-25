// RoadmapView — renders one goal's subgoals as a lightweight custom-SVG "metro
// map" (Phase 4 visual pass): stations laid out left-to-right by dependency
// depth, with curved lines for the soft "supports" edges.
//
// WHY a hybrid of SVG + absolutely-positioned HTML: the SVG layer draws the
// connecting lines (smooth, theme-stroked) while themed HTML pills
// (RoadmapStationNode) carry the labels (crisp text, easy truncation). The map
// consumes the SAME engine output as the earlier simple-list view did — only this
// presentation layer changed; the engine, store, and hook are untouched.
//
// LAYOUT is pure view-geometry (not domain logic, so it lives here, not in
// engine/): a station's COLUMN is its longest dependency depth (a supporter sits
// one column left of what it supports); ROWS stack stations within a column. The
// stations arrive in dependency order, so each station's supporters are already
// placed when we position it. Cycle-tangled stations (appended last by the
// engine) fall back to at least column 1 so they still render and connect.
//
// READ-ONLY: comprehension only. Empty and cyclic states are calm notes, never
// blockers (soft-dependency model).

import { Link } from 'react-router-dom'
import type { ID } from '@/core/types'
import type {
  RoadmapView as RoadmapViewModel,
  RoadmapStation,
} from '@/store/useGoalStore'
import { goalDetailPath } from '@/core/constants'
import { RoadmapStationNode } from './RoadmapStationNode'

interface RoadmapViewProps {
  view: RoadmapViewModel
}

// Pixel geometry for the map. Tuned for the page's max width with horizontal
// scroll for wider graphs (a deep chain naturally extends to the right).
const NODE_W = 168
const NODE_H = 56
const COL_GAP = 64
const ROW_GAP = 24
const PAD = 8
const COL_STRIDE = NODE_W + COL_GAP
const ROW_STRIDE = NODE_H + ROW_GAP

interface NodePos {
  x: number
  y: number
}
interface Edge {
  fromId: ID
  toId: ID
}
interface Layout {
  positions: Map<ID, NodePos>
  edges: Edge[]
  width: number
  height: number
}

function computeLayout(stations: RoadmapStation[]): Layout {
  const colOf = new Map<ID, number>()
  const rowsPerCol = new Map<number, number>()
  const positions = new Map<ID, NodePos>()
  const edges: Edge[] = []

  for (const station of stations) {
    const id = station.subgoal.id
    let col = 0
    for (const supporter of station.supportedBy) {
      const supporterCol = colOf.get(supporter.id)
      // A placed supporter pushes this station one column to its right; an unplaced
      // one (only possible inside a cycle) still forces at least column 1.
      col = Math.max(col, supporterCol !== undefined ? supporterCol + 1 : 1)
      edges.push({ fromId: supporter.id, toId: id })
    }
    colOf.set(id, col)
    const row = rowsPerCol.get(col) ?? 0
    rowsPerCol.set(col, row + 1)
    positions.set(id, {
      x: PAD + col * COL_STRIDE,
      y: PAD + row * ROW_STRIDE,
    })
  }

  const maxCol = Math.max(0, ...colOf.values())
  const maxRows = Math.max(1, ...rowsPerCol.values())
  const width = PAD * 2 + maxCol * COL_STRIDE + NODE_W
  const height = PAD * 2 + maxRows * ROW_STRIDE - ROW_GAP
  return { positions, edges, width, height }
}

// A horizontal cubic curve from a supporter's right edge to the dependent's left
// edge — the gentle "metro line" look. Control points are pulled horizontally so
// the curve leaves and enters each station flat.
function edgePath(from: NodePos, to: NodePos): string {
  const x1 = from.x + NODE_W
  const y1 = from.y + NODE_H / 2
  const x2 = to.x
  const y2 = to.y + NODE_H / 2
  const dx = Math.max(24, (x2 - x1) * 0.5)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
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

  const { positions, edges, width, height } = computeLayout(view.stations)

  return (
    <div className="mt-6">
      {/* A loop has no single "build order"; we still show every station (soft
          model) and just name the situation gently. */}
      {view.cyclic ? (
        <p className="mb-4 rounded-app border border-app-border bg-app-surface-alt px-3 py-2 text-xs text-app-text-muted">
          Some subgoals support each other in a loop, so the left-to-right order
          is approximate. Every subgoal is still shown.
        </p>
      ) : null}

      <div className="overflow-x-auto pb-2">
        <div className="relative" style={{ width, height }}>
          {/* Connection layer (behind the pills). Decorative — the same links are
              spelled out in each node's tooltip for hover and assistive tech. */}
          <svg
            className="absolute inset-0"
            width={width}
            height={height}
            aria-hidden="true"
          >
            {edges.map((edge) => {
              const from = positions.get(edge.fromId)
              const to = positions.get(edge.toId)
              if (!from || !to) return null
              return (
                <path
                  key={`${edge.fromId}->${edge.toId}`}
                  d={edgePath(from, to)}
                  fill="none"
                  strokeWidth={2}
                  strokeLinecap="round"
                  className="stroke-app-border"
                />
              )
            })}
          </svg>

          {/* Stations, rendered in dependency order so the DOM reading order
              matches the map even though positioning is absolute. */}
          {view.stations.map((station) => {
            const pos = positions.get(station.subgoal.id)
            if (!pos) return null
            return (
              <div
                key={station.subgoal.id}
                className="absolute"
                style={{ left: pos.x, top: pos.y, width: NODE_W, height: NODE_H }}
              >
                <RoadmapStationNode station={station} />
              </div>
            )
          })}
        </div>
      </div>

      <p className="mt-4 text-xs text-app-text-muted">
        Stations flow left to right: a subgoal sits to the right of the ones that
        support it. Add or change these soft links on each goal&apos;s detail page.
      </p>
    </div>
  )
}
