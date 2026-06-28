// GlassPanel — a floating, glassmorphism panel that hovers over the living map.
//
// Three behaviours the user asked for:
//   • draggable — grab the header and move it anywhere in the map area
//   • minimizable — collapse to just the title bar (and back)
//   • hover-to-focus — translucent at rest, near-opaque on hover so the map
//     stays visible until you actually look at a panel
//
// Pure presentation + local interaction state. It holds no app data; callers
// pass content as children. Positions are seeded from `initial` (any CSS inset)
// and become controlled once the user drags. Glass colours come from the
// --glass-* tokens so light/dark both work.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Minus, Plus } from '@phosphor-icons/react'

// Panel placement/collapse persists per title so a user's arranged layout
// survives reloads. Best-effort: any storage error just falls back to defaults.
interface StoredPanel {
  pos: { left: number; top: number } | null
  minimized: boolean
}
function readPanel(title: string): StoredPanel | null {
  try {
    const raw = localStorage.getItem(`lifemap-panel:${title}`)
    return raw ? (JSON.parse(raw) as StoredPanel) : null
  } catch {
    return null
  }
}
function writePanel(title: string, value: StoredPanel): void {
  try {
    localStorage.setItem(`lifemap-panel:${title}`, JSON.stringify(value))
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

interface GlassPanelProps {
  title: string
  // The panel's signature accent colour (a CSS colour, e.g. 'var(--accent-roadmap)').
  accent: string
  // Initial placement within the relatively-positioned map area.
  initial: { top?: number; left?: number; right?: number; bottom?: number }
  width?: number
  children: React.ReactNode
}

export function GlassPanel({
  title,
  accent,
  initial,
  width = 256,
  children,
}: GlassPanelProps) {
  // Seed from any saved layout (lazy init -> no setState-in-effect).
  const [minimized, setMinimized] = useState(() => readPanel(title)?.minimized ?? false)
  // Null until the first drag, so the panel honours its `initial` inset until
  // the user moves it; afterwards we drive left/top directly.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(
    () => readPanel(title)?.pos ?? null,
  )
  const [dragging, setDragging] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const offset = useRef({ x: 0, y: 0 })

  // Persist placement/collapse whenever they settle.
  useEffect(() => {
    writePanel(title, { pos, minimized })
  }, [title, pos, minimized])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Ignore drags that start on the minimize button.
    if ((e.target as HTMLElement).closest('button')) return
    const panel = ref.current
    const parent = panel?.offsetParent as HTMLElement | null
    if (!panel || !parent) return
    const r = panel.getBoundingClientRect()
    const pr = parent.getBoundingClientRect()
    offset.current = { x: e.clientX - r.left, y: e.clientY - r.top }
    // Convert whatever inset placement it had into explicit left/top so the drag
    // is continuous from its current spot.
    setPos({ left: r.left - pr.left, top: r.top - pr.top })
    setDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return
      const parent = ref.current?.offsetParent as HTMLElement | null
      if (!parent) return
      const pr = parent.getBoundingClientRect()
      setPos({
        left: e.clientX - pr.left - offset.current.x,
        top: e.clientY - pr.top - offset.current.y,
      })
    },
    [dragging],
  )

  const onPointerUp = useCallback(() => setDragging(false), [])

  // Once dragged we control left/top; before that, use the initial inset.
  const style: React.CSSProperties = pos
    ? { left: pos.left, top: pos.top, width }
    : { ...initial, width }

  return (
    <div
      ref={ref}
      className="group absolute z-20 rounded-app-lg border shadow-pop backdrop-blur-md backdrop-saturate-150 transition-[background-color,box-shadow] duration-300 border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)]"
      style={{ ...style, zIndex: dragging ? 40 : 20 }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`flex select-none items-center justify-between gap-2 px-3.5 pb-2 pt-3 ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-app-text">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: accent }}
            aria-hidden
          />
          {title}
        </h3>
        <button
          type="button"
          onClick={() => setMinimized((m) => !m)}
          aria-label={minimized ? `Expand ${title}` : `Minimize ${title}`}
          className="grid h-6 w-6 place-items-center rounded-app text-app-text-muted transition-colors hover:bg-app-surface-alt hover:text-app-text"
        >
          {minimized ? <Plus size={14} weight="bold" /> : <Minus size={14} weight="bold" />}
        </button>
      </div>
      {/* Body collapses to nothing when minimized. overflow-hidden + max-height
          keeps the transition smooth. */}
      <div
        className={`overflow-hidden px-3.5 transition-all duration-300 ${
          minimized ? 'max-h-0 pb-0 opacity-0' : 'max-h-[420px] pb-3.5 opacity-100'
        }`}
      >
        {children}
      </div>
    </div>
  )
}
