// User profile repository — all database access for the single UserProfile row.
//
// WHY this file exists: per the data-flow rule (DB -> Repositories -> Engine ->
// Store -> UI), every read or write touching the `profile` store lives here.
// Nothing outside database/repositories/ may import `db` or query the table.
//
// The profile is a SINGLE-ROW table (LifeMap is local-first, one user). So instead
// of a generated nanoid per row, every read/write targets ONE fixed key — get
// returns that row or undefined, save upserts it. UserProfile owns `createdAt`
// (set once) and `updatedAt` (refreshed every save), like Goal/Subgoal/Task.

import { db } from '../db';
import type { UserProfile } from '@/core/types';

// The fixed primary key of the single profile row.
export const PROFILE_ID = 'me';

// Fields the CALLER provides. id/createdAt/updatedAt are owned by the repository.
export type SaveProfileInput = Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Read the user's profile. Undefined (not an error) before it has ever been
 * saved — the Settings form treats that as "first-time setup" and seeds defaults.
 */
export async function getProfile(): Promise<UserProfile | undefined> {
  return db.profile.get(PROFILE_ID);
}

/**
 * Upsert the single profile row.
 *
 * WHY upsert and not separate create/update: there is only ever one profile, so
 * the caller (Settings) never knows or cares whether it exists yet — it just hands
 * over the current field values. `createdAt` is preserved across saves (set once,
 * on the first save); `updatedAt` is refreshed every time, the same per-entity
 * timestamp contract Goal/Subgoal/Task follow.
 */
export async function saveProfile(input: SaveProfileInput): Promise<UserProfile> {
  const now = new Date().toISOString();
  const existing = await db.profile.get(PROFILE_ID);
  const profile: UserProfile = {
    ...input,
    id: PROFILE_ID,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.profile.put(profile);
  return profile;
}
