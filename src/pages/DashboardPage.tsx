// Dashboard page — the "living map" home.
//
// The whole life is one map: goals are cities, subgoals are towns, soft
// dependencies are roads (this is where the roadmap now lives). The map pans and
// zooms; glassmorphism panels float over it — draggable, minimizable, and
// near-opaque on hover. Today's Focus toggles real tasks; Journey Overview,
// Upcoming and the daily Field Note read live data.
//
// The page owns the two loads (dashboard windows + the map) and selects store
// slices; it holds no business logic — the engine lays the map out, the store
// assembles it, the panels present it.

import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoalStore } from '@/store/useGoalStore'
import { useLifeMap } from '@/core/hooks/useLifeMap'
import { useProfile } from '@/core/hooks/useProfile'
import { goalDetailPath, ROUTES } from '@/core/constants'
import { LifeMapCanvas } from '@/features/dashboard/livingmap/LifeMapCanvas'
import { TodayFocusPanel } from '@/features/dashboard/livingmap/TodayFocusPanel'
import { JourneyOverviewPanel } from '@/features/dashboard/livingmap/JourneyOverviewPanel'
import { UpcomingPanel, type UpcomingItem } from '@/features/dashboard/livingmap/UpcomingPanel'
import { DailyQuotePanel } from '@/features/dashboard/livingmap/DailyQuotePanel'

function greeting(d: Date): string {
  const h = d.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { lifeMap, isLoading } = useLifeMap()
  const { profile } = useProfile()

  const todaysTasks = useGoalStore((s) => s.todaysTasks)
  const topPriorityTasks = useGoalStore((s) => s.topPriorityTasks)
  const toggleTaskComplete = useGoalStore((s) => s.toggleTaskComplete)
  const loadDashboard = useGoalStore((s) => s.loadDashboard)

  // The map loads via useLifeMap; this load fills the task windows the panels use.
  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const cities = useMemo(
    () => (lifeMap?.nodes ?? []).filter((n) => n.kind === 'city'),
    [lifeMap],
  )
  const townCount = (lifeMap?.nodes.length ?? 0) - cities.length
  const overallPercent = cities.length
    ? Math.round(cities.reduce((sum, c) => sum + c.percent, 0) / cities.length)
    : 0

  // Today first; fall back to the cross-goal priority list when nothing's planned.
  const focusTasks = todaysTasks.length > 0 ? todaysTasks : topPriorityTasks

  // Nearest still-open waypoints with a deadline, soonest first.
  const upcoming: UpcomingItem[] = useMemo(() => {
    if (!lifeMap) return []
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const out: UpcomingItem[] = []
    for (const n of lifeMap.nodes) {
      if (!n.date || n.state === 'done') continue
      if (new Date(n.date) < start) continue
      out.push({ id: n.id, label: n.label, date: n.date })
    }
    out.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    return out
  }, [lifeMap])

  const name = profile?.name?.trim() || 'explorer'
  const hasMap = !!lifeMap && lifeMap.nodes.length > 0

  return (
    <div className="relative h-[calc(100vh-7rem)] overflow-hidden rounded-app-lg border border-app-border bg-app-bg shadow-card">
      {/* the map fills the frame */}
      {hasMap ? (
        <LifeMapCanvas lifeMap={lifeMap} onPickGoal={(id) => navigate(goalDetailPath(id))} />
      ) : (
        <EmptyOrLoading isLoading={isLoading} onStart={() => navigate(ROUTES.GOALS)} />
      )}

      {/* greeting overlay (never blocks panning) */}
      <div className="pointer-events-none absolute left-6 top-5 z-10 max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-app-text">
          {greeting(new Date())}, {name}
        </h1>
        {hasMap && (
          <p className="mt-1.5 text-sm text-app-text-muted">
            You're <span className="font-mono font-semibold text-app-text">{overallPercent}%</span> of the way across your map.
          </p>
        )}
      </div>

      {/* floating glass panels (only once there's a map to float over) */}
      {hasMap && (
        <>
          <TodayFocusPanel tasks={focusTasks} onToggle={toggleTaskComplete} initial={{ top: 80, right: 20 }} width={248} />
          <UpcomingPanel items={upcoming} initial={{ bottom: 20, right: 20 }} width={248} />
          <JourneyOverviewPanel goals={cities.length} subgoals={townCount} overallPercent={overallPercent} initial={{ bottom: 20, left: 20 }} width={296} />
          <DailyQuotePanel initial={{ top: 104, left: 20 }} width={272} />
        </>
      )}
    </div>
  )
}

function EmptyOrLoading({ isLoading, onStart }: { isLoading: boolean; onStart: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      {isLoading ? (
        <p className="animate-pulse text-sm text-app-text-muted">Charting your map…</p>
      ) : (
        <>
          <h2 className="font-display text-xl font-semibold text-app-text">Your map is empty</h2>
          <p className="mt-2 max-w-sm text-sm text-app-text-muted">
            Plant your first goal and it becomes a city on the map — subgoals grow
            around it as towns, connected by the roads between them.
          </p>
          <button
            type="button"
            onClick={onStart}
            className="mt-5 rounded-app bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition-opacity hover:opacity-90"
          >
            Create your first goal
          </button>
        </>
      )}
    </div>
  )
}
