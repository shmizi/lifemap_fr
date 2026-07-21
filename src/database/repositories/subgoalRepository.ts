import { db } from '../db';
import { nanoid } from 'nanoid';
import type { Subgoal, SubgoalStatus, ID } from '@/core/types';
import { deleteDependenciesReferencing } from './dependencyRepository';
import { isCloudDataLive, cloudClient } from '@/database/backend';
import { subgoalToRow } from '@/database/migration/toRows';
import { subgoalFromRow } from '@/database/migration/fromRows';

// Create a subgoal. The caller owns goalId and order (a subgoal is meaningless
// without a parent and a display position); we own identity and timestamps so
// they are always set consistently.
export async function createSubgoal(
  data: Omit<Subgoal, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Subgoal> {
  const now = new Date().toISOString();
  const subgoal: Subgoal = {
    ...data,
    id: nanoid(),
    createdAt: now,
    updatedAt: now,
  };
  if (isCloudDataLive()) {
    const { error } = await cloudClient()
      .from('subgoals')
      .insert(subgoalToRow(subgoal));
    if (error) throw new Error(`createSubgoal: ${error.message}`);
    return subgoal;
  }
  await db.subgoals.add(subgoal);
  return subgoal;
}

// Single-record lookup by primary key. Returns undefined (not an error) when
// absent so callers decide what a miss means, matching getGoalById.
export async function getSubgoalById(id: ID): Promise<Subgoal | undefined> {
  if (isCloudDataLive()) {
    const { data, error } = await cloudClient()
      .from('subgoals')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`getSubgoalById: ${error.message}`);
    return data ? subgoalFromRow(data) : undefined;
  }
  return db.subgoals.get(id);
}

// All subgoals under one goal, in display order. goalId is indexed so the query
// hits the index; we then sort by `order` in memory.
// WHY: display order is what matters here, not creation time — and `order` is
// not an index, so sorting in memory avoids a schema change (same approach as
// getAllGoals sorting by createdAt).
export async function getSubgoalsByGoalId(goalId: ID): Promise<Subgoal[]> {
  if (isCloudDataLive()) {
    const { data, error } = await cloudClient()
      .from('subgoals')
      .select('*')
      .eq('goal_id', goalId);
    if (error) throw new Error(`getSubgoalsByGoalId: ${error.message}`);
    return (data ?? []).map(subgoalFromRow).sort((a, b) => a.order - b.order);
  }
  const subgoals = await db.subgoals.where('goalId').equals(goalId).toArray();
  return subgoals.sort((a, b) => a.order - b.order);
}

// All subgoals with a given status. status is NOT indexed on the subgoals store
// (the index is id + goalId only), so we load and filter in memory.
// WHY: the minimal-indexing rule keeps status out of the index, and subgoal
// counts are tiny — this matches how getAllGoals and getSubgoalsByGoalId handle
// unindexed access, and avoids a schema change + DB_VERSION migration.
export async function getSubgoalsByStatus(
  status: SubgoalStatus,
): Promise<Subgoal[]> {
  if (isCloudDataLive()) {
    const { data, error } = await cloudClient()
      .from('subgoals')
      .select('*')
      .eq('status', status);
    if (error) throw new Error(`getSubgoalsByStatus: ${error.message}`);
    return (data ?? []).map(subgoalFromRow);
  }
  const all = await db.subgoals.toArray();
  return all.filter((subgoal) => subgoal.status === status);
}

// Patch a subgoal and refresh updatedAt. Dexie update() returns the number of
// records changed; 0 means the id did not exist, which we surface loudly rather
// than silently no-op'ing (same contract as updateGoal).
export async function updateSubgoal(
  id: ID,
  changes: Partial<Omit<Subgoal, 'id' | 'createdAt'>>,
): Promise<Subgoal> {
  // Cloud: read-modify-write (reuses the full subgoalToRow mapper; upholds the
  // throw-on-missing-id contract), refreshing updatedAt like the Dexie branch.
  if (isCloudDataLive()) {
    const current = await getSubgoalById(id);
    if (!current) {
      throw new Error(`updateSubgoal: no subgoal found with id "${id}"`);
    }
    const merged: Subgoal = {
      ...current,
      ...changes,
      id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    const { error } = await cloudClient()
      .from('subgoals')
      .update(subgoalToRow(merged))
      .eq('id', id);
    if (error) throw new Error(`updateSubgoal: ${error.message}`);
    return merged;
  }
  const updated = await db.subgoals.update(id, {
    ...changes,
    updatedAt: new Date().toISOString(),
  });
  if (updated === 0) {
    throw new Error(`updateSubgoal: no subgoal found with id "${id}"`);
  }
  // Non-null assertion is safe: we just confirmed the record exists.
  return (await db.subgoals.get(id))!;
}

// Delete a subgoal AND its descendants — every milestone and every task under
// it. Wrapped in one rw transaction so the cascade is all-or-nothing (a failure
// rolls back rather than leaving a partial orphan trail). Tasks are found by
// subgoalId, which covers both milestone-grouped and loose tasks in one query.
//
// Also removes dependency edges in the SAME transaction so none outlive their
// endpoints: edges referencing this subgoal (the subgoal graph) and edges
// referencing any of its deleted tasks (the task graph). Task ids are collected
// before the task rows are deleted.
export async function deleteSubgoal(id: ID): Promise<void> {
  // Cloud: the subgoal FK cascade (0002) removes its milestones + tasks server-side;
  // we collect the task ids first only to prune the polymorphic dependency edges (no
  // endpoint FK). Not a single atomic tx (supabase-js limitation), same as deleteGoal.
  if (isCloudDataLive()) {
    const client = cloudClient();
    const { data: taskRows, error: taskErr } = await client
      .from('tasks')
      .select('id')
      .eq('subgoal_id', id);
    if (taskErr) throw new Error(`deleteSubgoal: ${taskErr.message}`);
    const taskIds = (taskRows ?? []).map((r) => r.id as ID);
    const { error } = await client.from('subgoals').delete().eq('id', id);
    if (error) throw new Error(`deleteSubgoal: ${error.message}`);
    await deleteDependenciesReferencing([id, ...taskIds]);
    return;
  }
  await db.transaction(
    'rw',
    db.subgoals,
    db.milestones,
    db.tasks,
    db.dependencies,
    async () => {
      const taskIds = await db.tasks
        .where('subgoalId')
        .equals(id)
        .primaryKeys();
      await db.milestones.where('subgoalId').equals(id).delete();
      await db.tasks.where('subgoalId').equals(id).delete();
      await db.subgoals.delete(id);
      await deleteDependenciesReferencing([id, ...taskIds]);
    },
  );
}