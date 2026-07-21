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
import { isCloudDataLive, cloudClient } from '@/database/backend';
import { userProfileToRow } from '@/database/migration/toRows';
import { userProfileFromRow } from '@/database/migration/fromRows';

// The fixed primary key of the single profile row.
export const PROFILE_ID = 'me';

// Fields the CALLER provides. id/createdAt/updatedAt are owned by the repository.
export type SaveProfileInput = Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Read the user's profile. Undefined (not an error) before it has ever been
 * saved — the Settings form treats that as "first-time setup" and seeds defaults.
 */
export async function getProfile(): Promise<UserProfile | undefined> {
  if (isCloudDataLive()) {
    // ONE row per user; RLS scopes the read to the signed-in user's own row, so no id
    // filter is needed. maybeSingle returns null before the profile has been saved.
    const { data, error } = await cloudClient()
      .from('user_profiles')
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`getProfile: ${error.message}`);
    return data ? userProfileFromRow(data) : undefined;
  }
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
  // Read the existing row through the dispatching getter so createdAt is preserved on
  // whichever backend is live (mirrors the Dexie read-modify-write below).
  const existing = await getProfile();
  const profile: UserProfile = {
    ...input,
    id: PROFILE_ID,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (isCloudDataLive()) {
    // Upsert on user_id (the PK). user_id is omitted from the row and defaults to
    // auth.uid() server-side, so the conflict target is the signed-in user's row.
    const { error } = await cloudClient()
      .from('user_profiles')
      .upsert(userProfileToRow(profile), { onConflict: 'user_id' });
    if (error) throw new Error(`saveProfile: ${error.message}`);
    return profile;
  }
  await db.profile.put(profile);
  return profile;
}
