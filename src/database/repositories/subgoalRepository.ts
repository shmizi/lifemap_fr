import { db } from '../db';
import { nanoid } from 'nanoid';
import type { Subgoal, SubgoalStatus, ID } from '@/core/types';

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
  await db.subgoals.add(subgoal);
  return subgoal;
}

// Single-record lookup by primary key. Returns undefined (not an error) when
// absent so callers decide what a miss means, matching getGoalById.
export async function getSubgoalById(id: ID): Promise<Subgoal | undefined> {
  return db.subgoals.get(id);
}

// All subgoals under one goal, in display order. goalId is indexed so the query
// hits the index; we then sort by `order` in memory.
// WHY: display order is what matters here, not creation time — and `order` is
// not an index, so sorting in memory avoids a schema change (same approach as
// getAllGoals sorting by createdAt).
export async function getSubgoalsByGoalId(goalId: ID): Promise<Subgoal[]> {
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
export async function deleteSubgoal(id: ID): Promise<void> {
  await db.transaction('rw', db.subgoals, db.milestones, db.tasks, async () => {
    await db.milestones.where('subgoalId').equals(id).delete();
    await db.tasks.where('subgoalId').equals(id).delete();
    await db.subgoals.delete(id);
  });
}