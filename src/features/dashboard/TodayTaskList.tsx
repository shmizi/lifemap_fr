// TodayTaskList — the dashboard's "what's scheduled today" list.
//
// Reads todaysTasks / isLoadingToday from the store and triggers loadTodaysTasks
// once on mount. Pure presentation otherwise: it renders the existing TaskRow
// for each task and a calm empty state when nothing is scheduled. No progress,
// streak, or health math here — those are engine concerns in a later session.
//
// TaskRow currently lives in features/goals/; it is imported directly for now.
// If a later session promotes TaskRow to components/, this import moves with it.

import { useEffect } from 'react'
import { useGoalStore } from '@/store/useGoalStore'
import { TaskRow } from '@/features/goals/TaskRow'

export function TodayTaskList() {
  const todaysTasks = useGoalStore((s) => s.todaysTasks)
  const isLoadingToday = useGoalStore((s) => s.isLoadingToday)
  const loadTodaysTasks = useGoalStore((s) => s.loadTodaysTasks)

  // Load once on mount. loadTodaysTasks is a stable store action.
  useEffect(() => {
    void loadTodaysTasks()
  }, [loadTodaysTasks])

  return (
    <section className="rounded-app-lg border border-app-border bg-app-surface p-6">
      <h2 className="text-lg font-semibold text-app-text">Today</h2>
      <p className="mt-1 text-sm text-app-text-muted">
        What you have scheduled for today.
      </p>

      <div className="mt-4">
        {isLoadingToday && todaysTasks.length === 0 ? (
          <p className="text-sm text-app-text-muted">Loading...</p>
        ) : todaysTasks.length === 0 ? (
          <p className="text-sm text-app-text-muted">
            Nothing scheduled for today.
          </p>
        ) : (
          <div className="space-y-1">
            {todaysTasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}