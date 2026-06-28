// LifeMapCanvas — the dashboard's living map, drawn as a cartographic chart.
//
// Renders the cross-goal map (cities = goals, towns = subgoals, roads = soft
// dependencies) over generated terrain (contour peaks, a lake, a river,
// forests). The user can PAN (drag), ZOOM (wheel / +- controls), click a place
// to FLY to it, and double-click to open its goal. Geometry + state come from
// the store; terrain is pure (see terrain.ts). Colours are app/accent/map tokens
// so light & dark both work; motion is CSS-driven so reduced-motion users land
// on the final frame.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Plus, Minus, ArrowsOut } from '@phosphor-icons/react'
import type { ID } from '@/core/types'
import type { LifeMapNode, LifeMapNodeState, LifeMapView } from '@/store/useGoalStore'
import { buildTerrain } from './terrain'

interface LifeMapCanvasProps {
  lifeMap: LifeMapView
  onPickGoal?: (goalId: ID) => void
}

const NODE_COLOR: Record<LifeMapNodeState | 'city', string> = {
  done: 'var(--accent-roadmap)',
  active: 'var(--accent-dashboard)',
  here: 'var(--accent-dashboard)',
  todo: 'var(--accent-settings)',
  city: 'var(--accent-goals)',
}

const MIN_SCALE = 0.45
const MAX_SCALE = 2.4

type View = { x: number; y: number; scale: number }

export function LifeMapCanvas({ lifeMap, onPickGoal }: LifeMapCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [t, setT] = useState<View>({ x: 0, y: 0, scale: 1 })
  // Mirror of `t` for imperative reads (tween/fly-to) without re-subscribing.
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])
  const [panning, setPanning] = useState(false)
  const pan = useRef({ x: 0, y: 0, active: false })
  const anim = useRef(0)

  const byId = useMemo(() => new Map(lifeMap.nodes.map((n) => [n.id, n])), [lifeMap])
  const terrain = useMemo(
    () =>
      buildTerrain(
        lifeMap.width,
        lifeMap.height,
        lifeMap.nodes,
        lifeMap.nodes.filter((n) => n.kind === 'city'),
      ),
    [lifeMap],
  )

  useLayoutEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    setT(fitView(vp.clientWidth, vp.clientHeight, lifeMap.width, lifeMap.height))
  }, [lifeMap.width, lifeMap.height])

  // Native wheel listener so we can preventDefault (React's onWheel is passive).
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      cancelAnimationFrame(anim.current)
      setT((p) => ({ ...p, scale: clamp(p.scale * factor, MIN_SCALE, MAX_SCALE) }))
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => () => cancelAnimationFrame(anim.current), [])

  // Smoothly animate the view to `to` (jump immediately for reduced motion).
  const tweenTo = useCallback((to: View) => {
    cancelAnimationFrame(anim.current)
    if (prefersReducedMotion()) {
      setT(to)
      return
    }
    const from = tRef.current
    const t0 = performance.now()
    const step = (now: number) => {
      const p = Math.min((now - t0) / 480, 1)
      const e = 1 - Math.pow(1 - p, 3)
      setT({
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
        scale: from.scale + (to.scale - from.scale) * e,
      })
      if (p < 1) anim.current = requestAnimationFrame(step)
    }
    anim.current = requestAnimationFrame(step)
  }, [])

  // Center a node in the viewport and zoom in a touch.
  const flyTo = useCallback(
    (x: number, y: number) => {
      const vp = viewportRef.current
      if (!vp) return
      const scale = clamp(Math.max(tRef.current.scale, 1.15), MIN_SCALE, MAX_SCALE)
      tweenTo({ x: vp.clientWidth / 2 - x * scale, y: vp.clientHeight / 2 - y * scale, scale })
    },
    [tweenTo],
  )

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as Element).closest('[data-node]')) return
    cancelAnimationFrame(anim.current)
    pan.current = { x: e.clientX, y: e.clientY, active: true }
    setPanning(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!pan.current.active) return
    const dx = e.clientX - pan.current.x
    const dy = e.clientY - pan.current.y
    pan.current.x = e.clientX
    pan.current.y = e.clientY
    setT((p) => ({ ...p, x: p.x + dx, y: p.y + dy }))
  }, [])

  const endPan = useCallback(() => {
    pan.current.active = false
    setPanning(false)
  }, [])

  const zoom = (dir: 'in' | 'out' | 'reset') => {
    const vp = viewportRef.current
    if (!vp) return
    if (dir === 'reset') {
      tweenTo(fitView(vp.clientWidth, vp.clientHeight, lifeMap.width, lifeMap.height))
      return
    }
    cancelAnimationFrame(anim.current)
    setT((p) => ({ ...p, scale: clamp(p.scale * (dir === 'in' ? 1.2 : 1 / 1.2), MIN_SCALE, MAX_SCALE) }))
  }

  return (
    <div
      ref={viewportRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerLeave={endPan}
      className={`relative h-full w-full overflow-hidden rounded-app-lg ${panning ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{ backgroundColor: 'var(--map-bg)' }}
    >
      <svg
        width={lifeMap.width}
        height={lifeMap.height}
        viewBox={`0 0 ${lifeMap.width} ${lifeMap.height}`}
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})` }}
      >
        <rect x={0} y={0} width={lifeMap.width} height={lifeMap.height} fill="var(--map-bg)" />

        {/* terrain (decorative, never intercepts pointer) */}
        <g aria-hidden style={{ pointerEvents: 'none' }}>
          {terrain.contours.map((d, i) => (
            <path key={`c${i}`} d={d} fill="none" stroke="var(--map-contour)" strokeWidth={1.3} />
          ))}
          {terrain.river && (
            <path d={terrain.river} fill="none" stroke="var(--map-water)" strokeWidth={8} strokeLinecap="round" opacity={0.7} />
          )}
          {terrain.lake && (
            <>
              <path d={terrain.lake.d} fill="var(--map-water)" stroke="var(--map-water-edge)" strokeWidth={1.5} opacity={0.85} />
              <text x={terrain.lake.label.x} y={terrain.lake.label.y} textAnchor="middle" className="font-display" fontStyle="italic" fontSize={13} fill="var(--map-water-edge)">Lake Clarity</text>
            </>
          )}
          {terrain.trees.map((p, i) => (
            <g key={`t${i}`} transform={`translate(${p.x}, ${p.y})`} opacity={0.8}>
              <path d="M0,-9 L5,4 L-5,4 Z" fill="var(--map-forest)" />
              <rect x={-1} y={3} width={2} height={3.5} fill="var(--map-forest)" />
            </g>
          ))}
        </g>

        {/* roads */}
        <g>
          {lifeMap.links.map((l, i) => {
            const a = byId.get(l.source)
            const b = byId.get(l.target)
            if (!a || !b) return null
            if (l.kind === 'member') {
              return <line key={l.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--map-road)" strokeWidth={1.5} opacity={0.5} />
            }
            return (
              <path
                key={l.id}
                className="lm-road"
                d={edgePath(a, b)}
                pathLength={1}
                fill="none"
                stroke={l.done ? 'var(--accent-roadmap)' : 'var(--map-road)'}
                strokeWidth={l.done ? 3 : 2.5}
                strokeLinecap="round"
                opacity={l.done ? 0.9 : 0.8}
                style={{ animationDelay: `${Math.min(i * 0.05, 1.2)}s` }}
              />
            )
          })}
        </g>

        {/* nodes */}
        <g>
          {lifeMap.nodes.map((n, i) => (
            <NodeGlyph
              key={n.id}
              node={n}
              delay={0.3 + Math.min(i * 0.04, 1)}
              onFocus={() => flyTo(n.x, n.y)}
              onOpen={() => onPickGoal?.(n.goalId)}
            />
          ))}
        </g>
      </svg>

      {/* compass rose — fixed to the viewport, not the panning map */}
      <CompassRoseGlyph />

      {/* zoom controls */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1.5">
        <CtrlBtn label="Zoom in" onClick={() => zoom('in')}><Plus size={16} weight="bold" /></CtrlBtn>
        <CtrlBtn label="Zoom out" onClick={() => zoom('out')}><Minus size={16} weight="bold" /></CtrlBtn>
        <CtrlBtn label="Reset view" onClick={() => zoom('reset')}><ArrowsOut size={15} weight="bold" /></CtrlBtn>
      </div>
      <p className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-app-border bg-app-surface/70 px-3 py-1 text-[11px] text-app-text-muted">
        Drag to pan · scroll to zoom · click to focus · double-click to open
      </p>
    </div>
  )
}

function NodeGlyph({
  node,
  delay,
  onFocus,
  onOpen,
}: {
  node: LifeMapNode
  delay: number
  onFocus: () => void
  onOpen: () => void
}) {
  const color = node.kind === 'city' ? NODE_COLOR.city : NODE_COLOR[node.state]
  return (
    <g
      data-node
      transform={`translate(${node.x}, ${node.y})`}
      className="lm-node cursor-pointer"
      style={{ animationDelay: `${delay}s` }}
      onClick={onFocus}
      onDoubleClick={onOpen}
    >
      {node.kind === 'city' ? (
        <>
          <ProgressRing r={26} percent={node.percent} color={color} />
          <circle r={21} fill="var(--color-surface)" opacity={0.85} />
          <circle r={17} fill={color} />
          <path d="M-7 4 L-7 -3 L-3 -6 L-3 4 Z M-1 4 L-1 -1 L3 -4 L3 4 Z M5 4 L5 -2 L8 -2 L8 4 Z" fill="#fff" opacity={0.95} />
          <text y={-32} textAnchor="middle" className="font-display" fontSize={15} fontWeight={600} fill="var(--color-text)">{node.label}</text>
          {node.sublabel && <text y={-17} textAnchor="middle" className="font-mono" fontSize={10} fill="var(--color-text-muted)">{node.sublabel}</text>}
        </>
      ) : (
        <>
          {node.state === 'here' && <circle className="lm-pulse" r={13} fill={color} opacity={0.45} />}
          {(node.state === 'active' || node.state === 'here') && <ProgressRing r={16} percent={node.percent} color={color} />}
          {node.state === 'done' ? (
            <>
              <circle r={12} fill={color} />
              <path d="M-4 0 L-1.5 3 L4.5 -4" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </>
          ) : node.state === 'here' ? (
            <>
              <circle r={12} fill="var(--color-surface)" stroke={color} strokeWidth={4} />
              <circle r={4} fill={color} />
            </>
          ) : node.state === 'active' ? (
            <>
              <circle r={11} fill="var(--color-surface)" stroke={color} strokeWidth={3} />
              <circle r={3.5} fill={color} />
            </>
          ) : (
            <circle r={10} fill="var(--color-surface)" stroke={color} strokeWidth={2.5} opacity={0.9} />
          )}
          <text y={28} textAnchor="middle" className="font-display" fontSize={12.5} fontWeight={600} fill="var(--color-text)">{node.label}</text>
          {node.state === 'here' && (
            <g transform="translate(0,-26)">
              <rect x={-50} y={-13} width={100} height={20} rx={10} fill="var(--color-text)" />
              <text y={1} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--color-bg)">You are here</text>
            </g>
          )}
        </>
      )}
    </g>
  )
}

function ProgressRing({ r, percent, color }: { r: number; percent: number; color: string }) {
  const c = 2 * Math.PI * r
  const filled = (clamp(percent, 0, 100) / 100) * c
  return (
    <>
      <circle r={r} fill="none" stroke="var(--color-surface-alt)" strokeWidth={4} />
      <circle r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeDasharray={`${filled} ${c}`} transform="rotate(-90)" />
    </>
  )
}

function CompassRoseGlyph() {
  return (
    <svg
      className="pointer-events-none absolute right-4 top-4 z-10 opacity-80"
      width={62}
      height={62}
      viewBox="0 0 62 62"
      aria-hidden
    >
      <circle cx={31} cy={31} r={28} fill="var(--color-surface)" opacity={0.55} />
      <circle cx={31} cy={31} r={28} fill="none" stroke="var(--color-border)" strokeWidth={1} />
      <polygon points="31,6 36,31 31,40 26,31" fill="var(--accent-goals)" />
      <polygon points="31,56 36,31 31,22 26,31" fill="var(--color-text-muted)" />
      <text x={31} y={5} textAnchor="middle" className="font-display" fontSize={9} fill="var(--color-text-muted)">N</text>
    </svg>
  )
}

function CtrlBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-app border border-app-border bg-app-surface text-app-text shadow-card transition-colors hover:bg-app-surface-alt"
    >
      {children}
    </button>
  )
}

function edgePath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const off = Math.min(46, len * 0.13)
  return `M${a.x},${a.y} Q${mx + (-dy / len) * off},${my + (dx / len) * off} ${b.x},${b.y}`
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function fitView(cw: number, ch: number, w: number, h: number): View {
  const fit = Math.min((cw - 100) / w, (ch - 100) / h)
  const scale = clamp(Number.isFinite(fit) ? fit : 1, 0.7, 1.15)
  return { x: (cw - w * scale) / 2, y: (ch - h * scale) / 2, scale }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}
