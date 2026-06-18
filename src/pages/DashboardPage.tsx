// Dashboard page — the at-a-glance home surface.
//
// Phase 2: a momentum indicator over today's scheduled tasks sits above the
// "Today" list. The page holds no business logic — it selects the precomputed
// todayProgress slice (the engine does the math, the store caches it) and passes
// it to the presentational MomentumBar. TodayTaskList triggers the load on mount,
// which also populates todayProgress, so the page never fetches anything itself.

import { useGoalStore } from '@/store/useGoalStore'
import { MomentumBar } from '@/components/progress/MomentumBar'
import { TodayTaskList } from '@/features/dashboard/TodayTaskList'

export function DashboardPage() {
  const todayProgress = useGoalStore((s) => s.todayProgress)

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-app-text">Dashboard</h1>
      <p className="mt-2 text-app-text-muted">
        Today's dashboard — what matters right now.
      </p>

      <div className="mt-6 space-y-4">
        <MomentumBar
          completed={todayProgress.completed}
          total={todayProgress.total}
          percent={todayProgress.percent}
        />
        <TodayTaskList />
      </div>
    </section>
  )
}