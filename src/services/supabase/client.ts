// services/supabase/client.ts — the single place the app gets its Supabase client,
// and the one switch that decides whether accounts exist in this build at all.
//
// ADR-0003 step 1 (Auth). Supabase is OPTIONAL: the app stays fully local-first
// (Dexie), and sign-in is an additive layer. When the two anon values are present
// we expose a real client; when either is missing we expose `null` and the auth
// store reports 'unconfigured', so the UI simply hides the account affordances and
// nothing breaks. Both values are client-visible by design (the anon key is not a
// secret — Row-Level Security is the real guard); they are read from Vite env and
// therefore only reach the bundle when explicitly set.
//
// Under test (MODE === 'test') the client is forced to null: vitest must never open
// a network client, exactly like services/ai forces MockAI. No test touches auth.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Accounts are live only when both anon values are set AND we're not under test.
export const isSupabaseConfigured =
  typeof url === 'string' &&
  url.length > 0 &&
  typeof anonKey === 'string' &&
  anonKey.length > 0 &&
  import.meta.env.MODE !== 'test'

// The client singleton, or null when unconfigured. Consumers must null-check (the
// auth store is the only consumer; it treats null as the 'unconfigured' state).
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        // Persist the session (so a reload stays signed in) and auto-refresh the
        // JWT — this token is what the Phase-2 edge AI proxy will verify.
        persistSession: true,
        autoRefreshToken: true,
        // Complete magic-link / OAuth redirects that land back with a token in the URL.
        detectSessionInUrl: true,
      },
    })
  : null
