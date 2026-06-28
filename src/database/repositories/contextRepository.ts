// Context repository — all database access for the AI-personalization context
// tables (Phase 9): the single-row `userContext` and the per-goal `goalContext`.
//
// WHY this file exists: per the data-flow rule (DB -> Repositories -> Engine ->
// Store -> UI), every read or write touching these stores lives here. Nothing
// outside database/repositories/ may import `db` or query the tables.
//
// Both follow the same per-entity timestamp contract as UserProfile: `createdAt`
// is set once (on the first save) and preserved; `updatedAt` is refreshed every
// save. userContext is a SINGLE row (one fixed key, upsert); goalContext is one
// row per goal (keyed by goalId, upsert), so a goal's intake is a direct lookup.

import { db } from '../db';
import type { UserContext, GoalContext, ID } from '@/core/types';

// The fixed primary key of the single userContext row (mirrors PROFILE_ID).
export const USER_CONTEXT_ID = 'me';

// Fields the CALLER provides. id/createdAt/updatedAt are owned by the repository.
export type SaveUserContextInput = Omit<
  UserContext,
  'id' | 'createdAt' | 'updatedAt'
>;
// goalContext is keyed by goalId, so the caller DOES supply goalId; timestamps
// are still owned by the repository.
export type SaveGoalContextInput = Omit<GoalContext, 'createdAt' | 'updatedAt'>;

/**
 * Read the user's standing context. Undefined (not an error) before it has ever
 * been saved — the onboarding gate treats that as "first run".
 */
export async function getUserContext(): Promise<UserContext | undefined> {
  return db.userContext.get(USER_CONTEXT_ID);
}

/**
 * Upsert the single userContext row. createdAt is preserved across saves;
 * updatedAt is refreshed every time (same contract as saveProfile).
 */
export async function saveUserContext(
  input: SaveUserContextInput,
): Promise<UserContext> {
  const now = new Date().toISOString();
  const existing = await db.userContext.get(USER_CONTEXT_ID);
  const context: UserContext = {
    ...input,
    id: USER_CONTEXT_ID,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.userContext.put(context);
  return context;
}

/**
 * Read one goal's intake context, or undefined if none was captured for it.
 */
export async function getGoalContext(
  goalId: ID,
): Promise<GoalContext | undefined> {
  return db.goalContext.get(goalId);
}

/**
 * Upsert one goal's intake context (keyed by goalId). createdAt preserved,
 * updatedAt refreshed — same per-entity timestamp contract as everywhere else.
 */
export async function saveGoalContext(
  input: SaveGoalContextInput,
): Promise<GoalContext> {
  const now = new Date().toISOString();
  const existing = await db.goalContext.get(input.goalId);
  const context: GoalContext = {
    ...input,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.goalContext.put(context);
  return context;
}

/**
 * Remove one goal's intake context. Plain leaf delete — called when its goal is
 * deleted so a goalContext row never outlives the goal it describes. Idempotent
 * (deleting a missing key is a no-op in Dexie).
 */
export async function deleteGoalContext(goalId: ID): Promise<void> {
  await db.goalContext.delete(goalId);
}
