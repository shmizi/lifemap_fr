/**
 * Task repository — all database access for the Task entity.
 *
 * WHY this file exists:
 * Per the data-flow rule (DB -> Repositories -> Engine -> Store -> UI), every
 * read or write touching the `tasks` store lives here. Nothing outside
 * database/repositories/ may import `db` or query the table directly.
 *
 * Task is the richest entity in the hierarchy, with two differences from
 * milestones that matter here:
 *   1. Task HAS `updatedAt` (like Subgoal). createTask stamps createdAt +
 *      updatedAt; updateTask refreshes updatedAt on every patch.
 *   2. `milestoneId` is OPTIONAL — undefined means the task attaches directly
 *      to its subgoal with no milestone in between.
 *
 * INDEXING (from stores.ts): tasks = 'id, subgoalId, milestoneId, status,
 * scheduledDate'. All four query fields are indexed, so the getters below use
 * where().equals() directly. `order` is NOT indexed, so order sorting is done
 * in memory (same convention as the other parent-child getters).
 */

import { nanoid } from 'nanoid';
import { db } from '@/database/db';
import type { ID, ISODate, Task, TaskStatus } from '@/core/types';
import { deleteDependenciesReferencing } from './dependencyRepository';

/**
 * Fields the CALLER provides. id/createdAt/updatedAt are generated here, so they
 * are omitted. Required by the Task type: subgoalId, title, status, priority,
 * isRecurring, order. Optional: description, dueDate, scheduledDate,
 * estimatedMinutes, effort, completedAt, milestoneId.
 */
export type CreateTaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

/** Patchable fields. id/createdAt/updatedAt are managed by the repository. */
export type UpdateTaskInput = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>;

export async function createTask(input: CreateTaskInput): Promise<Task> {
  // One `now` used for both stamps so a freshly-created task has
  // createdAt === updatedAt — makes "never edited" detectable and keeps tests
  // deterministic.
  const now = new Date().toISOString();
  const task: Task = {
    ...input,
    id: nanoid(),
    createdAt: now,
    updatedAt: now,
  };
  await db.tasks.add(task);
  return task;
}

export async function getTaskById(id: ID): Promise<Task | undefined> {
  // Primary-key lookup.
  return db.tasks.get(id);
}

export async function getAllTasks(): Promise<Task[]> {
  // Whole-table read. Tasks live in one flat table (the hierarchy is foreign-key
  // based, not nested storage — see stores.ts), so this is a direct toArray(),
  // NOT a per-goal composition loop. Unsorted: callers that need the whole
  // backlog (e.g. the Weekly Review's live computation) filter/group in memory.
  return db.tasks.toArray();
}

export async function getTasksBySubgoalId(subgoalId: ID): Promise<Task[]> {
  // subgoalId IS indexed → query via the index, then sort by `order` in memory
  // (order is not indexed). Same shape as getSubgoalsByGoalId.
  const tasks = await db.tasks.where('subgoalId').equals(subgoalId).toArray();
  return tasks.sort((a, b) => a.order - b.order);
}

export async function getTasksByMilestoneId(milestoneId: ID): Promise<Task[]> {
  // milestoneId IS indexed. Tasks with an undefined milestoneId are simply not
  // present in this index, so they're correctly excluded. Sorted by `order` in
  // memory, consistent with the other parent-child getters.
  const tasks = await db.tasks.where('milestoneId').equals(milestoneId).toArray();
  return tasks.sort((a, b) => a.order - b.order);
}

export async function getTasksByStatus(status: TaskStatus): Promise<Task[]> {
  // status IS indexed → query directly. Cross-cutting filter, so no order sort
  // (callers that need ordering will sort by the dimension they care about).
  return db.tasks.where('status').equals(status).toArray();
}

export async function getTasksByScheduledDate(scheduledDate: ISODate): Promise<Task[]> {
  // scheduledDate IS indexed → exact-match query. Tasks with no scheduledDate
  // are absent from this index and correctly excluded.
  return db.tasks.where('scheduledDate').equals(scheduledDate).toArray();
}

export async function getTasksScheduledBetween(
  start: ISODate,
  end: ISODate,
): Promise<Task[]> {
  // scheduledDate IS indexed → range-query the index instead of scanning. The
  // `true, true` flags make BOTH bounds inclusive, so a task scheduled exactly
  // at `start` (e.g. local midnight) or exactly at `end` is included. Tasks with
  // no scheduledDate are absent from this index and correctly excluded.
  //
  // Returned in scheduledDate-ascending order. We sort in memory because the
  // index yields key order but `order` (the in-group display position) is not
  // meaningful across a whole day; for a Today list, chronological is what the
  // UI wants. ISO strings compare lexicographically, which is chronological.
  // The `?? ''` only satisfies the optional type — every row here has a
  // scheduledDate, since rows without one aren't in the index.
  const tasks = await db.tasks
    .where('scheduledDate')
    .between(start, end, true, true)
    .toArray();
  return tasks.sort((a, b) =>
    (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''),
  );
}

export async function getTasksScheduledBefore(before: ISODate): Promise<Task[]> {
  // scheduledDate IS indexed → range-query the index. `.below()` is an EXCLUSIVE
  // upper bound, so a task scheduled exactly on `before` is NOT returned — pass
  // today to get strictly-past tasks (today belongs to its own list). Tasks with
  // no scheduledDate are absent from the index and correctly excluded.
  //
  // Returned scheduledDate-ascending (oldest first), matching
  // getTasksScheduledBetween — the dashboard's overdue list wants oldest at top.
  // Completion filtering is the caller's job (done in memory), per convention.
  const tasks = await db.tasks.where('scheduledDate').below(before).toArray();
  return tasks.sort((a, b) =>
    (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''),
  );
}

export async function updateTask(id: ID, changes: UpdateTaskInput): Promise<void> {
  // Refresh updatedAt on every patch (Task HAS this field, unlike Milestone).
  // Dexie's update() returns the modified-row count; 0 means no match → throw,
  // matching the updateGoal / updateSubgoal contract.
  const updatedCount = await db.tasks.update(id, {
    ...changes,
    updatedAt: new Date().toISOString(),
  });
  if (updatedCount === 0) {
    throw new Error(`updateTask: no task found with id "${id}"`);
  }
}

export async function deleteTask(id: ID): Promise<void> {
  // Task is a leaf node — no child entities to cascade. But it can be a
  // task->task dependency endpoint, and an edge must never outlive its endpoint,
  // so any edge referencing this task is removed in the SAME transaction as the
  // task delete (keeps the graph consistent even if one step were to fail).
  await db.transaction('rw', db.tasks, db.dependencies, async () => {
    await db.tasks.delete(id);
    await deleteDependenciesReferencing([id]);
  });
}