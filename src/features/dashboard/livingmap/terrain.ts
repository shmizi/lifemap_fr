// terrain — deterministic decorative cartography for the living map.
//
// Pure: given the canvas size and the node positions (to avoid drawing scenery
// on top of cities/towns), it returns the static map "scenery" — topographic
// contour peaks, a lake, a river, and scattered forests. Seeded by the canvas
// dimensions so the same map always looks the same between renders, and so it
// regenerates only when the layout size actually changes.
//
// No React, no DOM — the canvas renders these primitives. Colours are applied by
// the renderer via tokens; this only produces geometry.

interface Pt {
  x: number
  y: number
}

export interface Terrain {
  contours: string[] // SVG path `d` strings (nested elevation rings)
  lake: { d: string; label: Pt } | null
  river: string | null
  trees: Pt[]
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// An irregular closed blob around (cx,cy) of roughly radius r. `k` perturbs the
// control points so stacked rings aren't perfectly concentric (more natural).
function blob(cx: number, cy: number, r: number, k: number): string {
  const o = r * 0.14 * k
  return (
    `M${cx - r},${cy} ` +
    `C${cx - r},${cy - r * 0.7 + o} ${cx - r * 0.5},${cy - r} ${cx},${cy - r} ` +
    `C${cx + r * 0.62},${cy - r - o} ${cx + r},${cy - r * 0.58} ${cx + r},${cy} ` +
    `C${cx + r},${cy + r * 0.72 - o} ${cx + r * 0.55},${cy + r} ${cx},${cy + r} ` +
    `C${cx - r * 0.6},${cy + r + o} ${cx - r},${cy + r * 0.6} ${cx - r},${cy} Z`
  )
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function buildTerrain(width: number, height: number, nodes: Pt[], cities: Pt[]): Terrain {
  const rand = mulberry32(Math.round(width * 131 + height * 17) + 1)
  const contours: string[] = []

  // Elevation peaks: every city is a peak, plus a few decorative ones tucked into
  // empty space so the whole sheet reads as terrain, not just clusters.
  const peaks: Pt[] = [...cities]
  let attempts = 0
  const extra = Math.min(6, 2 + Math.floor((width * height) / 700_000))
  while (peaks.length < cities.length + extra && attempts < 200) {
    attempts++
    const p = { x: 60 + rand() * (width - 120), y: 60 + rand() * (height - 120) }
    if (peaks.every((q) => dist(p, q) > 220) && nodes.every((q) => dist(p, q) > 150)) {
      peaks.push(p)
    }
  }
  for (const p of peaks) {
    const rings = 3 + Math.floor(rand() * 3)
    const base = 42 + rand() * 24
    for (let i = 0; i < rings; i++) {
      contours.push(blob(p.x, p.y, base + i * (30 + rand() * 10), 1 + (rand() - 0.5)))
    }
  }

  // A lake in an empty corner-ish spot (away from nodes).
  let lake: Terrain['lake'] = null
  for (let i = 0; i < 60 && !lake; i++) {
    const c = { x: 70 + rand() * (width - 140), y: 70 + rand() * (height - 140) }
    if (nodes.every((q) => dist(c, q) > 170)) {
      const lr = Math.max(46, Math.min(width, height) * 0.07)
      lake = { d: blob(c.x, c.y, lr, 1.2), label: { x: c.x, y: c.y + 4 } }
    }
  }

  // A river meandering down one side.
  const onLeft = rand() > 0.5
  const rx = onLeft ? width * 0.12 : width * 0.88
  const river =
    `M${rx},-10 ` +
    `C${rx + 40},${height * 0.25} ${rx - 40},${height * 0.45} ${rx + 20},${height * 0.6} ` +
    `C${rx + 60},${height * 0.78} ${rx - 30},${height * 0.9} ${rx},${height + 10}`

  // Scattered forests, kept away from nodes and the lake.
  const trees: Pt[] = []
  for (let i = 0; i < 80 && trees.length < 22; i++) {
    const p = { x: 40 + rand() * (width - 80), y: 40 + rand() * (height - 80) }
    const clearNodes = nodes.every((q) => dist(p, q) > 90)
    const clearLake = !lake || dist(p, lake.label) > 90
    const clearTrees = trees.every((q) => dist(p, q) > 46)
    if (clearNodes && clearLake && clearTrees) trees.push(p)
  }

  return { contours, lake, river, trees }
}
