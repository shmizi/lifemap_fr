// Dashboard page — the at-a-glance home surface.
//
// Phase 2, Session 1: the first real content is the "Today" scheduled-task list,
// replacing the Phase 0 placeholder. Later sessions add momentum/progress
// sections below this one. The page stays "smart" only in that its children
// connect to the store; it holds no business logic itself.

import { TodayTaskList } from '@/features/dashboard/TodayTaskList'

export function DashboardPage() {
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-app-text">Dashboard</h1>
      <p className="mt-2 text-app-text-muted">
        Today's dashboard — what matters right now.
      </p>

      <div className="mt-6">
        <TodayTaskList />
      </div>
    </section>
  )
}