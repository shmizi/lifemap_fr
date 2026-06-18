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
  // Delete a milestone AND the tasks grouped under it. Wrapped in one rw
  // transaction so it is all-or-nothing. Leaving the tasks behind would strand
  // them with a dangling milestoneId — present in their subgoal's task list but
  // attached to no rendered milestone, so they would silently vanish from the
  // goal tree while still counting toward progress.
  await db.transaction('rw', db.milestones, db.tasks, async () => {
    await db.tasks.where('milestoneId').equals(id).delete();
    await db.milestones.delete(id);
  });
}