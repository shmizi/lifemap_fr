// Goal repository.
//
// WHY this file exists:
// The architecture rule is that the database is touched in exactly one place —
// the repository layer. UI never imports Dexie, and the engine never issues
// queries. Concentrating all goal-table reads and writes here means that if the
// storage shape ever changes (a new index, a migration, or even swapping Dexie
// out entirely), only this file changes. Everything above it keeps calling the
// same named functions.
//
// Each function below also owns the "house rules" for a Goal record: generating
// the id, stamping createdAt/updatedAt, and keeping updatedAt honest. Callers
// should never have to remember to do that themselves.

import { nanoid } from 'nanoid';
import { db } from '../db';
import type { Goal, ID, GoalStatus } from '@/core/types';
import { deleteDependenciesReferencing } from './dependencyRepository';

/**
 * Fields the CALLER provides. id/createdAt/updatedAt are generated here, so they
 * are omitted.
 */
export type CreateGoalInput = Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Create a new goal.
 *
 * WHY: callers describe a goal in domain terms (title, category, target date)
 * and should not be responsible for plumbing concerns like the primary key or
 * timestamps. We own those here so every goal in the table is well-formed and
 * the rest of the app can trust that id/createdAt/updatedAt always exist.
 */
export async function createGoal(data: CreateGoalInput): Promise<Goal> {
  // ISO 8601 strings are sortable as plain text, which is exactly what the
  // createdAt index relies on for ordering — no Date parsing needed at query time.
  const now = new Date().toISOString();

  const goal: Goal = {
    ...data,
    id: nanoid(),
    createdAt: now,
    updatedAt: now,
  };

  await db.goals.add(goal);
  return goal;
}

/**
 * Fetch a single goal by its primary key.
 *
 * WHY: a thin wrapper over Dexie's keyed get so the rest of the app never
 * references the table directly. Returns undefined (not an error) when the id
 * is unknown, because "look this up, it may not exist" is a normal read.
 */
export async function getGoalById(id: ID): Promise<Goal | undefined> {
  return db.goals.get(id);
}

/**
 * Fetch every goal, newest first.
 *
 * WHY: lists of goals are almost always shown most-recent-first, so we make
 * that the default ordering here rather than re-sorting in each UI component.
 *
 * WHY sort in memory instead of db.goals.orderBy('createdAt'): Dexie's orderBy
 * requires the key to be indexed, and createdAt is intentionally NOT indexed in
 * the goals store (the schema keeps indexing minimal). Since ISO date strings
 * sort lexicographically, a plain string comparison gives correct chronological
 * order, and the per-user goal count is small enough that an in-memory sort is
 * cheaper than maintaining a dedicated index just for this ordering.
 */
export async function getAllGoals(): Promise<Goal[]> {
  const all = await db.goals.toArray();
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Fetch goals filtered by status (e.g. only 'active' goals for the dashboard).
 *
 * WHY: status is an indexed field, so where().equals() lets IndexedDB do the
 * filtering instead of pulling every goal into memory and filtering in JS.
 * This keeps the dashboard query cheap as the goal count grows.
 */
export async function getGoalsByStatus(status: GoalStatus): Promise<Goal[]> {
  return db.goals.where('status').equals(status).toArray();
}

/**
 * Apply a partial update to a goal and return the updated record.
 *
 * WHY: id and createdAt are immutable facts about a record, so the type forbids
 * changing them. We always refresh updatedAt here so callers can never forget
 * to, which keeps "last touched" ordering and sync logic trustworthy. We throw
 * on a missing id because an update to a non-existent goal is a programming
 * error the caller should hear about, not swallow silently.
 */
export async function updateGoal(
  id: ID,
  changes: Partial<Omit<Goal, 'id' | 'createdAt'>>,
): Promise<Goal> {
  const updatedCount = await db.goals.update(id, {
    ...changes,
    updatedAt: new Date().toISOString(),
  });

  // Dexie's update() returns the number of records changed; 0 means no row
  // matched the id, so there is nothing to return.
  if (updatedCount === 0) {
    throw new Error(`updateGoal: no goal found with id "${id}"`);
  }

  // Re-fetch so callers get the full, current record rather than reconstructing
  // it from the partial changes they passed in.
  const updated = await db.goals.get(id);
  if (!updated) {
    // Defensive: the row existed a moment ago. If it is gone now, surface it
    // rather than returning a value the type says cannot be undefined.
    throw new Error(`updateGoal: goal "${id}" disappeared after update`);
  }

  return updated;
}

/**
 * Permanently remove a goal AND everything beneath it — its subgoals, their
 * milestones, and all their tasks.
 *
 * WHY cascade: a Goal is the root of a strict hierarchy (Goal -> Subgoal ->
 * Milestone/Task). Deleting only the goal row left descendants stranded in
 * IndexedDB forever — invisible to the UI but still counted by progress/priority
 * queries. Now the whole subtree goes.
 *
 * WHY one transaction: the deletes are wrapped in a single rw transaction so the
 * cascade is all-or-nothing. A mid-way failure rolls back rather than leaving a
 * half-deleted subtree (its own fresh orphan trail).
 *
 * Tasks are found by subgoalId, not by walking milestones: EVERY task carries a
 * subgoalId (milestoneId is optional), so deleting by subgoalId covers both
 * milestone-grouped and loose tasks in one query. Deleting an unknown id stays a
 * no-op (the subgoal/task queries simply match nothing).
 *
 * Dependency edges go too, in the SAME transaction, so none outlive their
 * endpoints: edges referencing any deleted subgoal (subgoal graph) or any
 * deleted task (task graph). The subgoal and task ids are collected before their
 * rows are removed.
 */
export async function deleteGoal(id: ID): Promise<void> {
  // Five tables exceed Dexie's variadic transaction overload, so the table list
  // is passed as an array (same transaction semantics).
  await db.transaction(
    'rw',
    [db.goals, db.subgoals, db.milestones, db.tasks, db.dependencies],
    async () => {
      const subgoalIds = await db.subgoals
        .where('goalId')
        .equals(id)
        .primaryKeys();

      let taskIds: ID[] = [];
      if (subgoalIds.length > 0) {
        taskIds = await db.tasks
          .where('subgoalId')
          .anyOf(subgoalIds)
          .primaryKeys();
        await db.milestones.where('subgoalId').anyOf(subgoalIds).delete();
        await db.tasks.where('subgoalId').anyOf(subgoalIds).delete();
      }

      await db.subgoals.where('goalId').equals(id).delete();
      await db.goals.delete(id);
      await deleteDependenciesReferencing([...subgoalIds, ...taskIds]);
    },
  );
}