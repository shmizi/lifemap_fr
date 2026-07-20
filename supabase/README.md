# Supabase setup — ADR-0003 step 1 (Auth)

This is the **auth-only** slice: users can sign in, and each account gets a durable
profile (edition ordinal + join year) that drives the colophon. **No app data moves
yet** — goals/tasks stay in the browser (Dexie) until ADR-0003 step 3.

Sign-in is **optional**. With no keys set, the app runs exactly as before and the
Account panel shows "not configured". Fill the two env values to switch accounts on.

## One-time setup

1. **Create a project** at [supabase.com](https://supabase.com) (free tier is fine).

2. **Run the migration.** In the project's **SQL Editor**, paste and run
   [`migrations/0001_profiles_and_edition.sql`](migrations/0001_profiles_and_edition.sql).
   It creates the `profiles` table, the edition counter, the signup trigger, and RLS.
   (Or, with the Supabase CLI linked: `supabase db push`.)

3. **Enable providers** under **Authentication → Providers**:
   - **Email** — turn on, keep "magic link" enabled.
   - **Google** — turn on and paste a Google OAuth client ID/secret
     ([Google Cloud console](https://console.cloud.google.com/apis/credentials)).

4. **Set redirect URLs** under **Authentication → URL Configuration → Redirect URLs**.
   Add your dev origin (e.g. `http://localhost:5173`) and, later, your production URL.
   The app redirects back to `window.location.origin`.

5. **Copy the two anon values** from **Project Settings → API** into your local `.env`
   (both are client-visible by design — RLS is the real guard):

   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...
   ```

6. **Restart `npm run dev`** (Vite only reads env at startup). Go to **Settings →
   Account** and sign in.

## What you should see

- **Settings → Account**: Google + email-link sign-in when signed out; email +
  "Vol. YY · Ed. N" + Sign out when signed in.
- **Colophon** (sidebar foot + dashboard footer): the real edition once signed in;
  the local default (`Ed. 1`) otherwise.

## Step 3 (Data) — schema + one-time import

The app-data schema now exists too. To enable the local→cloud seed:

1. **Run** [`migrations/0002_app_data.sql`](migrations/0002_app_data.sql) in the SQL
   Editor (after `0001`). It creates a user-scoped, RLS'd Postgres table for every
   local store (goals, subgoals, milestones, tasks, dependencies, user profile,
   user context, goal context, snapshots, opportunities), mirroring
   `src/database/schema/stores.ts`.
2. That's it — on the **next sign-in**, `importLocalDataToSupabase()` copies your
   existing local (Dexie) data into your account **once**. It self-guards, so it
   never double-imports.

**Scope caveat (important):** the app still **reads and writes Dexie** — Postgres is
seeded but not yet the live path. So local edits made *after* the first import won't
reach Postgres until the repository port lands (the next step). Nothing is lost:
Dexie stays the source of truth, and the import is safe to re-run (it no-ops once the
account has data).

## Not in this step

Flipping the live read/write path to Postgres (repository port), and billing/quota
(step 4) — see [`docs/adr/0003-backend-and-auth.md`](../docs/adr/0003-backend-and-auth.md).
