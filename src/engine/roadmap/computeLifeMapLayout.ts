// computeLifeMapLayout — PURE geometry for the dashboard's "living map".
//
// The dashboard renders the whole life as a map: each goal is a CITY, its
// subgoals are TOWNS clustered around it, soft dependencies are ROADS between
// towns (including cross-goal roads — that interconnection is the point), and a
// faint MEMBERSHIP link ties each town to its city.
//
// Like buildRoadmap, this returns FACTS, not pixels-of-meaning: it produces
// positions + structure only. It reads no clock, no DB, no store; the store
// joins live state (titles, progress, completion) onto these nodes afterwards.
// A richer renderer can consume the same output unchanged.
//
// Layout: cities sit on a ring (or the centre when there's only one); each
// city's towns sit on a smaller ring around it, fanned outward. Coordinates are
// then translated into a positive box with padding for labels, and the box size
// is returned so the canvas knows its scrollable extent.

import type { ID } from '@/core/types'

export interface LifeMapLayoutNode {
  id: ID
  kind: 'city' | 'town'
  goalId: ID
  x: number
  y: number
}

export interface LifeMapLayoutLink {
  id: string
  source: ID
  target: ID
  kind: 'dep' | 'member'
}

export interface LifeMapLayout {
  nodes: LifeMapLayoutNode[]
  links: LifeMapLayoutLink[]
  width: number
  height: number
}

// A subgoal dependency edge, narrowed to the two fields layout needs. Dependency
// from the data model is assignable to this.
export interface LayoutEdge {
  fromId: ID
  toId: ID
}

const PAD = 180 // breathing room around the content for labels
const TOWN_BASE_RADIUS = 175 // town ring radius at its smallest
const TOWN_RADIUS_PER_TOWN = 14 // grows the ring so dense clusters don't overlap

/**
 * Lay out goals (cities) and their subgoals (towns) into a connected map.
 *
 * @param goalIds          goal ids in display order (one city each)
 * @param subgoalsByGoal   subgoal ids per goal, in display order (towns)
 * @param edges            subgoal→subgoal dependency edges (roads)
 */
export function computeLifeMapLayout(
  goalIds: ID[],
  subgoalsByGoal: Record<ID, ID[]>,
  edges: LayoutEdge[],
): LifeMapLayout {
  const nodes: LifeMapLayoutNode[] = []
  const links: LifeMapLayoutLink[] = []
  const townIds = new Set<ID>()

  const n = goalIds.length
  // City ring grows with the number of goals so clusters keep their distance.
  const cityRing = n <= 1 ? 0 : Math.max(440, 280 + n * 60)

  goalIds.forEach((goalId, i) => {
    const cityAngle = n <= 1 ? 0 : -Math.PI / 2 + (i * 2 * Math.PI) / n
    const cx = n <= 1 ? 0 : Math.cos(cityAngle) * cityRing
    const cy = n <= 1 ? 0 : Math.sin(cityAngle) * cityRing
    nodes.push({ id: goalId, kind: 'city', goalId, x: cx, y: cy })

    const towns = subgoalsByGoal[goalId] ?? []
    const m = towns.length
    const townRing = TOWN_BASE_RADIUS + m * TOWN_RADIUS_PER_TOWN
    towns.forEach((subId, j) => {
      // Fan towns evenly around their city; offset by the city's own angle so a
      // cluster leans outward from the centre rather than overlapping neighbours.
      const t = cityAngle + (j * 2 * Math.PI) / Math.max(m, 1)
      nodes.push({
        id: subId,
        kind: 'town',
        goalId,
        x: cx + Math.cos(t) * townRing,
        y: cy + Math.sin(t) * townRing,
      })
      townIds.add(subId)
      links.push({
        id: `m-${subId}`,
        source: subId,
        target: goalId,
        kind: 'member',
      })
    })
  })

  // Roads: keep only edges whose BOTH endpoints are towns we placed. Cross-goal
  // edges are kept on purpose — they are the visible interconnection.
  const seen = new Set<string>()
  for (const e of edges) {
    if (!townIds.has(e.fromId) || !townIds.has(e.toId)) continue
    const id = `d-${e.fromId}-${e.toId}`
    if (seen.has(id)) continue
    seen.add(id)
    links.push({ id, source: e.fromId, target: e.toId, kind: 'dep' })
  }

  // Translate everything into a positive, padded box and report its size.
  if (nodes.length === 0) {
    return { nodes, links, width: PAD * 2, height: PAD * 2 }
  }
  const xs = nodes.map((nd) => nd.x)
  const ys = nodes.map((nd) => nd.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  for (const nd of nodes) {
    nd.x = nd.x - minX + PAD
    nd.y = nd.y - minY + PAD
  }
  return {
    nodes,
    links,
    width: maxX - minX + PAD * 2,
    height: maxY - minY + PAD * 2,
  }
}
