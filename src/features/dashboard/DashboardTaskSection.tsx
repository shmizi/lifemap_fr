// DashboardTaskSection — one titled card of scheduled tasks on the dashboard.
//
// Pure presentation: it takes a title, the tasks to show, the shared loading
// flag, the empty-state text, and the per-subgoal lineage map, then renders the
// existing TaskRow for each task plus its "why it matters" lineage line. No
// store, no fetching, no date/progress math — the dashboard owns the load and
// passes each window's slice in. Generalized from the old TodayTaskList so
// Overdue / Today / Upcoming are the same component with different props.
//
// The lineage ("Subgoal · Goal") is rendered HERE rather than inside TaskRow:
// it answers "why does this matter" only in the dashboard's cross-goal context.
// Inside the goal tree (TaskRow's other home) the parent goal is already the
// surrounding screen, so the same line there would be redundant.
//
// TaskRow currently lives in features/goals/; it is imported directly for now.
// If a later session promotes TaskRow to components/, this import moves with it.

import type { ID, Task, TaskLineage } from '@/core/types'
import { TaskRow } from '@/features/goals/TaskRow'

interface DashboardTaskSectionProps {
  title: string
  subtitle: string
  tasks: Task[]
  // Subgoal -> goal lineage keyed by subgoalId, shared across all sections. A
  // task whose subgoal is missing here simply shows no lineage line.
  lineages: Record<ID, TaskLineage>
  isLoading: boolean
  emptyText: string
}

export function DashboardTaskSection({
  title,
  subtitle,
  tasks,
  lineages,
  isLoading,
  emptyText,
}: DashboardTaskSectionProps) {
  return (
    <section className="rounded-app-lg border border-app-border bg-app-surface p-6">
      <h2 className="text-lg font-semibold text-app-text">{title}</h2>
      <p className="mt-1 text-sm text-app-text-muted">{subtitle}</p>

      <div className="mt-4">
        {isLoading && tasks.length === 0 ? (
          <p className="text-sm text-app-text-muted">Loading...</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-app-text-muted">{emptyText}</p>
        ) : (
          <div className="space-y-1">
            {tasks.map((task) => {
              const lineage = lineages[task.subgoalId]
              return (
                <div key={task.id}>
                  <TaskRow task={task} />
                  {/* Indented to sit under the task title (past TaskRow's toggle
                      icon), so the lineage reads as a caption for that task. */}
                  {lineage ? (
                    <p className="truncate pb-1 pl-[30px] text-[11px] leading-tight text-app-text-muted">
                      {lineage.subgoalTitle} · {lineage.goalTitle}
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
