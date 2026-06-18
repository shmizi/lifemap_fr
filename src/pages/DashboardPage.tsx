// Dashboard page — the at-a-glance home surface.
//
// Phase 2: a momentum indicator over today's scheduled tasks, then three
// scheduled-task windows — Overdue, Today, Upcoming. The page owns the single
// load on mount and selects each store slice; it holds no business logic (the
// engine does the math, the store fetches and caches). Each section is the same
// presentational DashboardTaskSection with a different window. Overdue only
// appears when something is actually overdue, so a caught-up user sees no
// guilt-inducing empty box.

import { useEffect } from 'react'
import { useGoalStore } from '@/store/useGoalStore'
import { MomentumBar } from '@/components/progress/MomentumBar'
import { DashboardTaskSection } from '@/features/dashboard/DashboardTaskSection'

export function DashboardPage() {
  const overdueTasks = useGoalStore((s) => s.overdueTasks)
  const todaysTasks = useGoalStore((s) => s.todaysTasks)
  const thisWeekTasks = useGoalStore((s) => s.thisWeekTasks)
  const taskLineages = useGoalStore((s) => s.taskLineages)
  const todayProgress = useGoalStore((s) => s.todayProgress)
  const isLoadingDashboard = useGoalStore((s) => s.isLoadingDashboard)
  const loadDashboard = useGoalStore((s) => s.loadDashboard)

  // Load once on mount. loadDashboard is a stable store action.
  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

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

        {/* Overdue is hidden when empty — being caught up should feel clean,
            not like an empty to-do box. */}
        {overdueTasks.length > 0 ? (
          <DashboardTaskSection
            title="Overdue"
            subtitle="Scheduled earlier and still open."
            tasks={overdueTasks}
            lineages={taskLineages}
            isLoading={isLoadingDashboard}
            emptyText=""
          />
        ) : null}

        <DashboardTaskSection
          title="Today"
          subtitle="What you have scheduled for today."
          tasks={todaysTasks}
          lineages={taskLineages}
          isLoading={isLoadingDashboard}
          emptyText="Nothing scheduled for today."
        />

        <DashboardTaskSection
          title="Upcoming"
          subtitle="Scheduled over the next 7 days."
          tasks={thisWeekTasks}
          lineages={taskLineages}
          isLoading={isLoadingDashboard}
          emptyText="Nothing scheduled in the next week."
        />
      </div>
    </section>
  )
}
