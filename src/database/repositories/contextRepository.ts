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
import type {
  UserContext,
  GoalContext,
  StrategyBrief,
  SourceDocument,
  ID,
} from '@/core/types';
import { isCloudDataLive, cloudClient } from '@/database/backend';
import { userContextToRow, goalContextToRow } from '@/database/migration/toRows';
import { userContextFromRow, goalContextFromRow } from '@/database/migration/fromRows';

// The fixed primary key of the single userContext row (mirrors PROFILE_ID).
export const USER_CONTEXT_ID = 'me';

// Persist a fully-built goalContext row to whichever backend is live. Shared by the
// three writers below (saveGoalContext / saveStrategyBrief / saveGoalLearnings), which
// all read-modify-write the SAME row and differ only in which fields they compute.
// Cloud upserts on goal_id (the PK); user_id defaults to auth.uid() server-side.
async function putGoalContext(context: GoalContext): Promise<GoalContext> {
  if (isCloudDataLive()) {
    const { error } = await cloudClient()
      .from('goal_context')
      .upsert(goalContextToRow(context), { onConflict: 'goal_id' });
    if (error) throw new Error(`putGoalContext: ${error.message}`);
    return context;
  }
  await db.goalContext.put(context);
  return context;
}

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
  if (isCloudDataLive()) {
    // ONE row per user; RLS scopes the read, so no id filter is needed.
    const { data, error } = await cloudClient()
      .from('user_context')
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`getUserContext: ${error.message}`);
    return data ? userContextFromRow(data) : undefined;
  }
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
  const existing = await getUserContext();
  const context: UserContext = {
    ...input,
    id: USER_CONTEXT_ID,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (isCloudDataLive()) {
    // Upsert on user_id (the PK); user_id defaults to auth.uid() server-side.
    const { error } = await cloudClient()
      .from('user_context')
      .upsert(userContextToRow(context), { onConflict: 'user_id' });
    if (error) throw new Error(`saveUserContext: ${error.message}`);
    return context;
  }
  await db.userContext.put(context);
  return context;
}

/**
 * Read one goal's intake context, or undefined if none was captured for it.
 */
export async function getGoalContext(
  goalId: ID,
): Promise<GoalContext | undefined> {
  if (isCloudDataLive()) {
    const { data, error } = await cloudClient()
      .from('goal_context')
      .select('*')
      .eq('goal_id', goalId)
      .maybeSingle();
    if (error) throw new Error(`getGoalContext: ${error.message}`);
    return data ? goalContextFromRow(data) : undefined;
  }
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
  const existing = await getGoalContext(input.goalId);
  const context: GoalContext = {
    ...input,
    // The strategy brief is written via saveStrategyBrief, NOT the intake form, so
    // an intake save must never wipe an already-generated brief: keep the existing
    // one unless this input explicitly carries a newer one.
    strategyBrief: input.strategyBrief ?? existing?.strategyBrief,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return putGoalContext(context);
}

/**
 * Read one goal's generated Strategy Brief, or undefined if none exists yet.
 * A thin accessor over the goalContext row so the store/UI need not know the brief
 * is stored alongside the intake.
 */
export async function getStrategyBrief(
  goalId: ID,
): Promise<StrategyBrief | undefined> {
  const existing = await getGoalContext(goalId);
  return existing?.strategyBrief;
}

/**
 * Write a goal's Strategy Brief onto its goalContext row, PRESERVING any intake
 * fields already there (read-modify-write, not a blind replace). If the goal has
 * no context row yet, one is created with a soft-deadline default (the app's
 * non-hard default) so the brief has a home. createdAt preserved, updatedAt
 * refreshed — same per-entity timestamp contract as the rest of this repo.
 */
export async function saveStrategyBrief(
  goalId: ID,
  brief: StrategyBrief,
): Promise<GoalContext> {
  const now = new Date().toISOString();
  const existing = await getGoalContext(goalId);
  const context: GoalContext = {
    goalId,
    deadlineHardness: 'soft',
    ...existing,
    strategyBrief: brief,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return putGoalContext(context);
}

/**
 * Update ONLY a goal's living "what I've learned" note, preserving every other
 * intake field (read-modify-write, not a blind replace — same discipline as
 * saveStrategyBrief). Creates the row with a soft-deadline default if none exists.
 * A blank note clears the field. createdAt preserved, updatedAt refreshed.
 */
export async function saveGoalLearnings(
  goalId: ID,
  learnings: string,
): Promise<GoalContext> {
  const now = new Date().toISOString();
  const existing = await getGoalContext(goalId);
  const context: GoalContext = {
    goalId,
    deadlineHardness: 'soft',
    ...existing,
    learnings: learnings.trim() || undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return putGoalContext(context);
}

/**
 * Attach (or, with null, detach) the distilled reference document on a goal.
 * Read-modify-write like saveGoalLearnings / saveStrategyBrief, so it preserves
 * every other intake field. Creates the row with a soft-deadline default if none
 * exists. Only the SUMMARY is ever stored — the raw document is never persisted
 * (see core/types SourceDocument for why).
 */
export async function saveGoalSourceDocument(
  goalId: ID,
  sourceDocument: SourceDocument | null,
): Promise<GoalContext> {
  const now = new Date().toISOString();
  const existing = await getGoalContext(goalId);
  const context: GoalContext = {
    goalId,
    deadlineHardness: 'soft',
    ...existing,
    sourceDocument: sourceDocument ?? undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return putGoalContext(context);
}

/**
 * Remove one goal's intake context. Plain leaf delete — called when its goal is
 * deleted so a goalContext row never outlives the goal it describes. Idempotent
 * (deleting a missing key is a no-op in Dexie).
 */
export async function deleteGoalContext(goalId: ID): Promise<void> {
  if (isCloudDataLive()) {
    const { error } = await cloudClient()
      .from('goal_context')
      .delete()
      .eq('goal_id', goalId);
    if (error) throw new Error(`deleteGoalContext: ${error.message}`);
    return;
  }
  await db.goalContext.delete(goalId);
}
