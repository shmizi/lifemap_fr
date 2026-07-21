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
import { isCloudDataLive, cloudClient } from '@/database/backend';
import { taskToRow } from '@/database/migration/toRows';
import { taskFromRow } from '@/database/migration/fromRows';

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
  if (isCloudDataLive()) {
    const { error } = await cloudClient().from('tasks').insert(taskToRow(task));
    if (error) throw new Error(`createTask: ${error.message}`);
    return task;
  }
  await db.tasks.add(task);
  return task;
}

export async function getTaskById(id: ID): Promise<Task | undefined> {
  if (isCloudDataLive()) {
    const { data, error } = await cloudClient()
      .from('tasks')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`getTaskById: ${error.message}`);
    return data ? taskFromRow(data) : undefined;
  }
  // Primary-key lookup.
  return db.tasks.get(id);
}

export async function getAllTasks(): Promise<Task[]> {
  if (isCloudDataLive()) {
    const { data, error } = await cloudClient().from('tasks').select('*');
    if (error) throw new Error(`getAllTasks: ${error.message}`);
    return (data ?? []).map(taskFromRow);
  }
  // Whole-table read. Tasks live in one flat table (the hierarchy is foreign-key
  // based, not nested storage — see stores.ts), so this is a direct toArray(),
  // NOT a per-goal composition loop. Unsorted: callers that need the whole
  // backlog (e.g. the Weekly Review's live computation) filter/group in memory.
  return db.tasks.toArray();
}

export async function getTasksBySubgoalId(subgoalId: ID): Promise<Task[]> {
  if (isCloudDataLive()) {
    const { data, error } = await cloudClient()
      .from('tasks')
      .select('*')
      .eq('subgoal_id', subgoalId);
    if (error) throw new Error(`getTasksBySubgoalId: ${error.message}`);
    return (data ?? []).map(taskFromRow).sort((a, b) => a.order - b.order);
  }
  // subgoalId IS indexed → query via the index, then sort by `order` in memory
  // (order is not indexed). Same shape as getSubgoalsByGoalId.
  const tasks = await db.tasks.where('subgoalId').equals(subgoalId).toArray();
  return tasks.sort((a, b) => a.order - b.order);
}

export async function getTasksByMilestoneId(milestoneId: ID): Promise<Task[]> {
  if (isCloudDataLive()) {
    // Tasks with a NULL milestone_id are excluded by `.eq`, mirroring the Dexie index
    // (undefined milestoneId is absent from the index → correctly excluded).
    const { data, error } = await cloudClient()
      .from('tasks')
      .select('*')
      .eq('milestone_id', milestoneId);
    if (error) throw new Error(`getTasksByMilestoneId: ${error.message}`);
    return (data ?? []).map(taskFromRow).sort((a, b) => a.order - b.order);
  }
  // milestoneId IS indexed. Tasks with an undefined milestoneId are simply not
  // present in this index, so they're correctly excluded. Sorted by `order` in
  // memory, consistent with the other parent-child getters.
  const tasks = await db.tasks.where('milestoneId').equals(milestoneId).toArray();
  return tasks.sort((a, b) => a.order - b.order);
}

export async function getTasksByStatus(status: TaskStatus): Promise<Task[]> {
  if (isCloudDataLive()) {
    const { data, error } = await cloudClient()
      .from('tasks')
      .select('*')
      .eq('status', status);
    if (error) throw new Error(`getTasksByStatus: ${error.message}`);
    return (data ?? []).map(taskFromRow);
  }
  // status IS indexed → query directly. Cross-cutting filter, so no order sort
  // (callers that need ordering will sort by the dimension they care about).
  return db.tasks.where('status').equals(status).toArray();
}

export async function getTasksByScheduledDate(scheduledDate: ISODate): Promise<Task[]> {
  if (isCloudDataLive()) {
    // NULL scheduled_date rows are excluded by `.eq`, matching the Dexie index.
    const { data, error } = await cloudClient()
      .from('tasks')
      .select('*')
      .eq('scheduled_date', scheduledDate);
    if (error) throw new Error(`getTasksByScheduledDate: ${error.message}`);
    return (data ?? []).map(taskFromRow);
  }
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
  if (isCloudDataLive()) {
    // .gte/.lte = both bounds inclusive, matching Dexie's between(_, _, true, true).
    // Postgres NULL comparisons are never true, so rows with no scheduled_date are
    // excluded, exactly like their absence from the Dexie index.
    const { data, error } = await cloudClient()
      .from('tasks')
      .select('*')
      .gte('scheduled_date', start)
      .lte('scheduled_date', end);
    if (error) throw new Error(`getTasksScheduledBetween: ${error.message}`);
    return (data ?? [])
      .map(taskFromRow)
      .sort((a, b) =>
        (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''),
      );
  }
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
  if (isCloudDataLive()) {
    // .lt = EXCLUSIVE upper bound, matching Dexie's .below(). NULL scheduled_date
    // rows are excluded (NULL comparisons are never true).
    const { data, error } = await cloudClient()
      .from('tasks')
      .select('*')
      .lt('scheduled_date', before);
    if (error) throw new Error(`getTasksScheduledBefore: ${error.message}`);
    return (data ?? [])
      .map(taskFromRow)
      .sort((a, b) =>
        (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''),
      );
  }
  const tasks = await db.tasks.where('scheduledDate').below(before).toArray();
  return tasks.sort((a, b) =>
    (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''),
  );
}

export async function updateTask(id: ID, changes: UpdateTaskInput): Promise<void> {
  // Cloud: read-modify-write (reuses the full taskToRow mapper), refreshing updatedAt
  // and upholding throw-on-missing-id — same contract as the Dexie branch. NOTE: a
  // caller clearing an optional (e.g. milestoneId: undefined) works because the merge
  // carries it and taskToRow maps undefined → null; a key ABSENT from `changes` is
  // preserved from `current`.
  if (isCloudDataLive()) {
    const current = await getTaskById(id);
    if (!current) {
      throw new Error(`updateTask: no task found with id "${id}"`);
    }
    const merged: Task = {
      ...current,
      ...changes,
      id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    const { error } = await cloudClient()
      .from('tasks')
      .update(taskToRow(merged))
      .eq('id', id);
    if (error) throw new Error(`updateTask: ${error.message}`);
    return;
  }
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
  // Cloud: delete the task, then prune any dependency edge referencing it (edges are
  // polymorphic — no FK — so Postgres won't cascade them). Not one atomic tx
  // (supabase-js limitation); a dangling edge is tolerated by the engine anyway.
  if (isCloudDataLive()) {
    const { error } = await cloudClient().from('tasks').delete().eq('id', id);
    if (error) throw new Error(`deleteTask: ${error.message}`);
    await deleteDependenciesReferencing([id]);
    return;
  }
  // Task is a leaf node — no child entities to cascade. But it can be a
  // task->task dependency endpoint, and an edge must never outlive its endpoint,
  // so any edge referencing this task is removed in the SAME transaction as the
  // task delete (keeps the graph consistent even if one step were to fail).
  await db.transaction('rw', db.tasks, db.dependencies, async () => {
    await db.tasks.delete(id);
    await deleteDependenciesReferencing([id]);
  });
}