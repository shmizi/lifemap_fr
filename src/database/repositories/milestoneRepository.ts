/**
 * Milestone repository — all database access for the Milestone entity.
 *
 * WHY this file exists:
 * Per the data-flow rule (DB -> Repositories -> Engine -> Store -> UI), every
 * read or write touching the `milestones` store lives here. Nothing outside
 * database/repositories/ may import `db` or query the table directly.
 *
 * Mirrors goalRepository / subgoalRepository, with two DELIBERATE differences
 * driven by the canonical Milestone type:
 *   1. Milestone has NO `updatedAt`. We set `createdAt` on create and never
 *      maintain an "updated" timestamp — updateMilestone only patches fields.
 *   2. Required-on-create fields are subgoalId, title, status, order,
 *      aiSuggested (description and completedAt are optional).
 */

import { nanoid } from 'nanoid';
import { db } from '@/database/db';
import type { ID, Milestone, MilestoneStatus } from '@/core/types';

/**
 * Fields the CALLER must provide. id and createdAt are generated here, so they
 * are omitted from the input. Everything else — including the required
 * subgoalId, status, order, aiSuggested — comes from the caller; the repository
 * does not invent parent relationships or ordering.
 */
export type CreateMilestoneInput = Omit<Milestone, 'id' | 'createdAt'>;

/**
 * Patchable fields. id and createdAt are immutable after creation, so they are
 * not patchable. (There is intentionally no updatedAt to refresh.)
 */
export type UpdateMilestoneInput = Partial<Omit<Milestone, 'id' | 'createdAt'>>;

export async function createMilestone(
  input: CreateMilestoneInput
): Promise<Milestone> {
  // nanoid id + a single ISO createdAt — same identity convention as the goal
  // and subgoal repositories. No updatedAt: Milestone does not have one.
  const milestone: Milestone = {
    ...input,
    id: nanoid(),
    createdAt: new Date().toISOString(),
  };
  await db.milestones.add(milestone);
  return milestone;
}

export async function getMilestoneById(id: ID): Promise<Milestone | undefined> {
  // Primary-key lookup — `id` is the store's key, so this is a direct get().
  return db.milestones.get(id);
}

export async function getMilestonesBySubgoalId(
  subgoalId: ID
): Promise<Milestone[]> {
  // subgoalId IS indexed on the milestones store (stores.ts: 'id, subgoalId'),
  // so we query via the index instead of scanning the whole table — consistent
  // with getSubgoalsByGoalId and getTasksBySubgoalId. `order` is not indexed, so
  // that sort stays in memory (same convention as the other by-parent getters).
  const milestones = await db.milestones
    .where('subgoalId')
    .equals(subgoalId)
    .toArray();
  return milestones.sort((a, b) => a.order - b.order);
}

export async function getMilestonesByStatus(
  status: MilestoneStatus
): Promise<Milestone[]> {
  // In-memory filter — `status` is not indexed (consistent with subgoals, where
  // getSubgoalsByStatus also filters in memory). Milestone counts are tiny.
  const all = await db.milestones.toArray();
  return all.filter((m) => m.status === status);
}

export async function updateMilestone(
  id: ID,
  changes: UpdateMilestoneInput
): Promise<void> {
  // Dexie's update() returns the number of rows modified; 0 means no row matched
  // the id — we throw, matching the updateGoal / updateSubgoal contract.
  // IMPORTANT: unlike subgoals, we do NOT refresh an updatedAt — Milestone has none.
  const updatedCount = await db.milestones.update(id, changes);
  if (updatedCount === 0) {
    throw new Error(`updateMilestone: no milestone found with id "${id}"`);
  }
}

export async function deleteMilestone(id: ID): Promise<void> {
  // Delete the milestone but REHOME its tasks rather than destroy them: a
  // milestone is an organizational checkpoint, not a structural container, so an
  // accidental delete must not erase task history/progress. Each task keeps its
  // subgoalId and becomes a loose task (milestoneId cleared); it then renders in
  // the subgoal's "Other tasks" section, which already supports milestone-less
  // tasks end to end. (Contrast deleteGoal/deleteSubgoal, which DO cascade-delete
  // their subtrees.)
  //
  // All of it runs in one rw transaction so the rehome + milestone removal is
  // all-or-nothing.
  //
  // `order` is scoped per (subgoal, milestone-group): loose tasks form their own
  // order sequence. We re-sequence the rehomed tasks onto the END of that loose
  // sequence rather than keeping their old per-milestone order values, which
  // would collide with existing loose tasks.
  //
  // Clearing milestoneId: passing `undefined` to Dexie's update() DELETES the
  // property, which also removes the row from the milestoneId index (verified by
  // a dedicated test in taskRepository.test.ts).
  await db.transaction('rw', db.milestones, db.tasks, async () => {
    const milestone = await db.milestones.get(id);
    if (!milestone) return; // unknown id -> nothing to do (idempotent)

    const subgoalTasks = await db.tasks
      .where('subgoalId')
      .equals(milestone.subgoalId)
      .toArray();

    // Highest existing loose-task order under this subgoal; rehomed tasks append
    // after it. -1 so the first appended task lands at 0 when there are none.
    const looseOrders = subgoalTasks
      .filter((t) => t.milestoneId === undefined)
      .map((t) => t.order);
    let nextOrder = looseOrders.length === 0 ? 0 : Math.max(...looseOrders) + 1;

    // Rehome this milestone's tasks in their current order, so their relative
    // sequence is preserved as they move into the loose group.
    const milestoneTasks = subgoalTasks
      .filter((t) => t.milestoneId === id)
      .sort((a, b) => a.order - b.order);
    const now = new Date().toISOString();
    for (const task of milestoneTasks) {
      await db.tasks.update(task.id, {
        milestoneId: undefined,
        order: nextOrder,
        updatedAt: now,
      });
      nextOrder += 1;
    }

    await db.milestones.delete(id);
  });
}