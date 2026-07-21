// database/backend.ts — the ONE switch that decides, per call, whether the
// repositories read/write local Dexie (GUEST mode) or the user's Supabase Postgres
// (SIGNED-IN mode).
//
// ADR-0003 step 3 (the repository PORT), refined to the two-mode architecture:
//
//   UI → Repository Layer → { Dexie (guest)  |  Supabase (signed-in) }
//
// The decision is PURELY authentication state — no build flag, no manual opt-in:
//   • Not signed in (guest)  → Dexie. The app works fully offline, no account needed.
//   • Signed in              → Supabase. Reads and writes go to the user's Postgres.
// Nothing above the repository layer knows or cares which backend is live; every UI /
// store / engine call goes through the same repository function names.
//
// Under test (or with no Supabase keys) `supabase` is null → isSupabaseConfigured is
// false → isCloudDataLive() is always false → the Dexie branch is the only one
// reached, so the whole suite still exercises guest mode exactly as before.
//
// Same seam discipline as services/supabase: repositories import THIS, never the
// Supabase client directly for the dispatch decision (the client is still used for the
// actual queries). We cache the signed-in user id from the auth listener so the
// per-call decision is synchronous — no `await getSession()` on every read.

import { supabase, isSupabaseConfigured } from '@/services/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'

// Cached id of the currently signed-in user, or null (guest). Kept in sync by the auth
// listener below so isCloudDataLive() can answer synchronously at every call site.
let currentUserId: string | null = null

// Fired whenever the live backend may have changed — the signed-in user id changing
// (sign-in / sign-out / initial resolve), OR the first-run Dexie→Supabase migration
// finishing (see notifyBackendChanged). Lets the app re-read data from whichever
// backend is now live. See main.tsx.
let changeListeners: Array<() => void> = []

function emitBackendChange() {
  for (const cb of changeListeners) cb()
}

// Attach our OWN auth listener (independent of useAuthStore's) so this low-level data
// module has no dependency on the store. supabase-js supports multiple subscribers.
// Skipped entirely when unconfigured/under test, leaving currentUserId null forever
// → isCloudDataLive() is always false → guest (Dexie) is the only path reached.
if (isSupabaseConfigured && supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    const next = session?.user?.id ?? null
    if (next !== currentUserId) {
      currentUserId = next
      emitBackendChange()
    }
  })
}

/**
 * The per-call decision every repository consults: is the signed-in (Supabase) path
 * live right now? True iff Supabase is configured AND a user is signed in. Guests and
 * the test environment always get false → Dexie.
 */
export function isCloudDataLive(): boolean {
  return isSupabaseConfigured && currentUserId !== null
}

/**
 * The Supabase client, guaranteed non-null. Call ONLY inside an `isCloudDataLive()`
 * branch — that check already implies the client exists; this throw is a defensive
 * assertion so a misuse fails loudly instead of dereferencing null.
 */
export function cloudClient(): SupabaseClient {
  if (!supabase) {
    throw new Error('cloudClient(): Supabase is not configured')
  }
  return supabase
}

/**
 * Subscribe to backend-liveness changes. Returns an unsubscribe function. The bootstrap
 * uses this to re-load data when the live backend switches (sign-in/out) or when the
 * first-run migration finishes seeding — so the UI reflects the now-live backend rather
 * than the copy the first paint may have read before the session/import resolved.
 */
export function onBackendChange(cb: () => void): () => void {
  changeListeners.push(cb)
  return () => {
    changeListeners = changeListeners.filter((l) => l !== cb)
  }
}

/**
 * Manually announce that the live backend's contents may have changed WITHOUT the
 * user id changing — specifically, right after the one-time Dexie→Supabase migration
 * seeds the account on first sign-in. The auth listener already fired once when the
 * session resolved (possibly before the seed finished), so this second signal makes the
 * UI re-read the freshly-seeded cloud data. Safe to call anytime; a redundant refresh
 * is harmless.
 */
export function notifyBackendChanged(): void {
  emitBackendChange()
}
