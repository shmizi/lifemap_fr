// Auth store — the single place the UI reads sign-in state from, and the only
// place that talks to the Supabase auth client (services/supabase).
//
// ADR-0003 step 1. Optional sign-in over a local-first app: identity is additive
// and holds NO data yet (Dexie is still the source of truth; the one-time import
// is step 3). What signing in buys today is the durable PROFILE — the edition
// ordinal ("Nth user to join") and join year that the client cannot know on its
// own — which the colophon then renders for real instead of the local default.
//
// Same seam discipline as the goal store: components never import the Supabase
// client; they read this store and call these actions. The store never reaches
// into Dexie or the goal data — the two datastores stay independent until step 3.

import { create } from 'zustand'
import { supabase, isSupabaseConfigured } from '@/services/supabase/client'
import { importLocalDataToSupabase } from '@/database/migration/importToSupabase'

// The durable per-user profile row (see supabase/migrations — profiles). Only the
// two fields the UI needs today; email is kept for the account panel.
export interface AccountProfile {
  email: string | null
  // Signup ordinal assigned server-side by the edition sequence (1, 2, 3, …).
  edition: number
  // The calendar year the user joined, fixed at signup (the colophon's "Volume").
  joinedYear: number
}

// unconfigured : this build has no Supabase keys — accounts don't exist, hide all
//                account UI. loading : resolving the initial session. signed_out /
//                signed_in : the two live states.
export type AuthStatus = 'unconfigured' | 'loading' | 'signed_out' | 'signed_in'

interface AuthState {
  status: AuthStatus
  userId: string | null
  email: string | null
  profile: AccountProfile | null
  // Transient, calm feedback for the account panel (e.g. "Check your email").
  // Not an app-level error — sign-in failures belong to the panel, like a form.
  notice: string | null
  isWorking: boolean

  // Subscribe to auth changes and resolve the initial session. Idempotent and
  // safe to call once at bootstrap; a no-op (sets 'unconfigured') without keys.
  init: () => void
  signInWithGoogle: () => Promise<void>
  // Passwordless email magic link. We never handle a password (auth is Supabase's
  // job); the user gets a one-time link that redirects back signed in.
  signInWithEmail: (email: string) => Promise<void>
  signOut: () => Promise<void>
  clearNotice: () => void
}

// Whether the init subscription is already wired, so a double init() (StrictMode
// mounts effects twice in dev) doesn't stack listeners.
let subscribed = false

// Whether the one-time local→cloud seed has been attempted this page load, so token
// refreshes / re-emitted sessions don't re-trigger it. The importer ALSO self-guards
// per account (localStorage + a goals-count check); this just avoids redundant calls
// within a session. On error it stays false so a later sign-in can retry.
let importTriggered = false

export const useAuthStore = create<AuthState>()((set, get) => {
  // Read the signed-in user's profile row (edition + join year). RLS restricts the
  // read to their own row; a missing row (trigger lag on a brand-new signup) simply
  // leaves profile null and the colophon falls back — never throws into the UI.
  const loadProfile = async (userId: string, email: string | null) => {
    if (!supabase) return
    const { data } = await supabase
      .from('profiles')
      .select('edition, joined_year')
      .eq('id', userId)
      .maybeSingle()
    set({
      profile: data
        ? { email, edition: data.edition, joinedYear: data.joined_year }
        : null,
    })
  }

  // Fold a Supabase session into store state, loading the profile when present.
  const applySession = (
    session: { user: { id: string; email?: string } } | null,
  ) => {
    if (session?.user) {
      const email = session.user.email ?? null
      set({ status: 'signed_in', userId: session.user.id, email })
      void loadProfile(session.user.id, email)
      // One-time seed of local Dexie data into the account (ADR-0003 step 3).
      // Best-effort and fire-and-forget: a failure never blocks sign-in, and Dexie
      // remains the source of truth, so nothing is lost if it doesn't land now.
      if (!importTriggered) {
        importTriggered = true
        void importLocalDataToSupabase().then((r) => {
          // Retry on a later sign-in if the seed errored (guard stays down).
          if (r.status === 'error') importTriggered = false
        })
      }
    } else {
      set({
        status: 'signed_out',
        userId: null,
        email: null,
        profile: null,
      })
    }
  }

  return {
    status: 'loading',
    userId: null,
    email: null,
    profile: null,
    notice: null,
    isWorking: false,

    init: () => {
      if (!isSupabaseConfigured || !supabase) {
        set({ status: 'unconfigured' })
        return
      }
      if (subscribed) return
      subscribed = true
      // onAuthStateChange fires an INITIAL_SESSION event on subscribe, so this one
      // listener resolves the current session AND every later sign-in/out — no
      // separate getSession() call needed.
      supabase.auth.onAuthStateChange((_event, session) => {
        applySession(session)
      })
    },

    signInWithGoogle: async () => {
      if (!supabase) return
      set({ isWorking: true, notice: null })
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          // Land back on whatever origin the app is served from (dev or prod).
          options: { redirectTo: window.location.origin },
        })
        // On success the browser redirects to Google; if it returns instead, an
        // error is the only reason. (No success branch — the page is navigating.)
        if (error) set({ notice: 'Could not start Google sign-in. Please try again.' })
      } finally {
        set({ isWorking: false })
      }
    },

    signInWithEmail: async (email) => {
      if (!supabase) return
      const trimmed = email.trim()
      if (!trimmed) return
      set({ isWorking: true, notice: null })
      try {
        const { error } = await supabase.auth.signInWithOtp({
          email: trimmed,
          options: { emailRedirectTo: window.location.origin },
        })
        set({
          notice: error
            ? 'Could not send the sign-in link. Please try again.'
            : 'Check your email for a sign-in link.',
        })
      } finally {
        set({ isWorking: false })
      }
    },

    signOut: async () => {
      if (!supabase) return
      set({ isWorking: true })
      try {
        await supabase.auth.signOut()
        // applySession via the listener will flip to signed_out; set eagerly too so
        // the UI updates even if the event is briefly delayed.
        set({ status: 'signed_out', userId: null, email: null, profile: null })
      } finally {
        set({ isWorking: false })
      }
    },

    clearNotice: () => set({ notice: null }),
  }
})
