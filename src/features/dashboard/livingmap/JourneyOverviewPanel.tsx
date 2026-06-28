// JourneyOverviewPanel — the glass "at a glance" panel: how many goals (cities)
// and subgoals (towns) are on the map, and overall progress as a ring that
// counts up on mount. Numbers come from the page (derived from the live map +
// goal progress); this only presents them.

import { useEffect, useRef, useState } from 'react'
import { GlassPanel } from './GlassPanel'

interface JourneyOverviewPanelProps {
  goals: number
  subgoals: number
  overallPercent: number
  initial: { top?: number; left?: number; right?: number; bottom?: number }
  width?: number
}

// Count a number up from 0 to `target` once on mount. Honours reduced motion by
// starting AT the value (lazy initial state), so the effect never sets state
// synchronously — only the async rAF callback does, when motion is allowed.
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}
function useCountUp(target: number, ms = 1100): number {
  const [v, setV] = useState(() => (prefersReducedMotion() ? target : 0))
  const raf = useRef<number>(0)
  useEffect(() => {
    if (prefersReducedMotion()) return
    let start: number | null = null
    const step = (ts: number) => {
      if (start === null) start = ts
      const p = Math.min((ts - start) / ms, 1)
      setV(Math.round(p * target))
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target, ms])
  return v
}

export function JourneyOverviewPanel({ goals, subgoals, overallPercent, initial, width }: JourneyOverviewPanelProps) {
  const g = useCountUp(goals)
  const s = useCountUp(subgoals)
  const pct = useCountUp(overallPercent)

  const r = 26
  const c = 2 * Math.PI * r
  const filled = (Math.max(0, Math.min(100, overallPercent)) / 100) * c

  return (
    <GlassPanel title="Journey Overview" accent="var(--accent-reviews)" initial={initial} width={width}>
      <div className="flex items-center gap-3">
        <Stat value={g} label="Goals" />
        <Stat value={s} label="Subgoals" />
        <div className="relative ml-auto h-[68px] w-[68px] shrink-0">
          <svg width={68} height={68} viewBox="0 0 68 68">
            <circle cx={34} cy={34} r={r} fill="none" stroke="var(--color-surface-alt)" strokeWidth={6} />
            <circle
              cx={34} cy={34} r={r} fill="none"
              stroke="var(--accent-roadmap)" strokeWidth={6} strokeLinecap="round"
              strokeDasharray={`${filled} ${c}`}
              transform="rotate(-90 34 34)"
              style={{ transition: 'stroke-dasharray 1.1s ease-out' }}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <span className="font-mono text-base font-semibold text-app-text">{pct}%</span>
          </div>
        </div>
      </div>
    </GlassPanel>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <div className="font-mono text-xl font-semibold leading-none text-app-text">{value}</div>
      <div className="mt-1 text-[10px] text-app-text-muted">{label}</div>
    </div>
  )
}
