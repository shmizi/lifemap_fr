# Deploying LifeMap to Vercel (real-AI beta)

This is the exact setup to deploy LifeMap on Vercel with **real Claude roadmap
generation** (not MockAI), so a signed-in tester can use it end to end.

Storage stays two-mode automatically: a **guest** (not signed in) works fully offline
on local Dexie; a **signed-in** user reads/writes your Supabase Postgres. Real AI,
however, **requires sign-in** — the AI proxy rejects anonymous calls (see below).

---

## 0. Prerequisites (once)

- Supabase project `krvongccwumxuerhyfun` with migrations **0001 → 0005 run in order**
  (`supabase/migrations/`). 0001 = profiles/edition, 0002 = app data, 0003 = AI quota,
  0004 = slip events, 0005 = goal reference documents. Real AI works without 0003
  (quota fails open) but you lose the per-user monthly cap, so run it. **0005 is not
  optional: run it BEFORE deploying this code.** Every write to `goal_context` sends
  `source_document`, so without the column signed-in users can't save goal intake,
  strategy briefs or learnings.
- An **Anthropic API key** with billing enabled (this key pays for every generation —
  see "Cost" at the bottom).
- The repo pushed to a Git provider Vercel can import.

---

## 1. Vercel environment variables

In the Vercel project → **Settings → Environment Variables**, add these for the
**Production** (and Preview, if you want) environment:

| Name | Value | Why |
|------|-------|-----|
| `VITE_SUPABASE_URL` | `https://krvongccwumxuerhyfun.supabase.co` | Client auth + data. Baked into the browser bundle at build. |
| `VITE_SUPABASE_ANON_KEY` | your **publishable/anon** key (the `sb_publishable_…` value from your local `.env`) | Client auth + data. **Not** the secret key. |
| `VITE_USE_REAL_AI` | `true` | Flips the app from MockAI to real Claude. Build-time; without it you ship canned mock roadmaps. |
| `ANTHROPIC_API_KEY` | your Anthropic key | **Server-only** — used by `api/ai.ts`. Do **NOT** prefix with `VITE_` (that would leak it into the browser). |
| `ANTHROPIC_MODEL_QUALITY` | `claude-sonnet-5` | Optional — this now matches the code default. Set it only to use a different quality model (e.g. `claude-opus-4-8`). |
| `ANTHROPIC_MODEL_FAST` | `claude-haiku-4-5-20251001` | Optional — this already matches the default; set it only to change the fast tier. |
| `AI_MONTHLY_LIMIT` | e.g. `50` | Optional — generations per user per month (default 100). Lower = tighter cost cap for beta. |

Notes:
- The edge function reads Supabase values from `SUPABASE_URL`/`SUPABASE_ANON_KEY` **or**
  falls back to the `VITE_`-prefixed ones, so the four `VITE_…` + `ANTHROPIC_…` vars
  above are sufficient — no duplicate `SUPABASE_*` needed.
- `api/ai.ts` is picked up automatically by Vercel as an Edge Function at `/api/ai`
  (its `export const config = { runtime: 'edge' }`). No `vercel.json` required.
- After changing any `VITE_…` var you must **redeploy** (they're baked at build time).

---

## 2. Supabase — allow the Vercel URL for sign-in

Google sign-in currently only allows `http://localhost:5173`. Your tester on the Vercel
URL will hit `redirect_uri_mismatch` until you fix this.

In **Supabase → Authentication → URL Configuration**:
- **Site URL:** `https://<your-app>.vercel.app`
- **Redirect URLs:** add `https://<your-app>.vercel.app/**`
  (keep `http://localhost:5173/**` for local dev)

If you use a custom domain later, add it here too.

> **Google Cloud console needs no change.** The OAuth flow redirects Google →
> *Supabase* callback (`https://krvongccwumxuerhyfun.supabase.co/auth/v1/callback`),
> which is already in your Google client's Authorized redirect URIs. Supabase then
> redirects to your app, and that final hop is governed by the Supabase Redirect URLs
> above — not by Google.

---

## 3. Deploy

1. Import the repo in Vercel (framework preset: **Vite**; build `npm run build`,
   output `dist` — Vercel auto-detects these).
2. Ensure the env vars from step 1 are set for the environment you're deploying.
3. Deploy. Note the production URL and put it into the Supabase config in step 2.

---

## 4. Verify (do this yourself before inviting the tester)

On the deployed URL:

1. **Guest works:** without signing in, create a goal — it should save (local Dexie),
   no network errors.
2. **Sign-in works:** Settings → Account → Continue with Google → lands back signed in
   (this is what step 2 fixes). Your local data uploads to Supabase once (one-time
   migration).
3. **Real AI works:** open a goal → *Generate roadmap with AI*. In DevTools → Network,
   `POST /api/ai` should return **200** with real content.
   - `401 "Please sign in to use AI."` → you're not signed in (or the JWT didn't attach).
   - `500 "Server is missing ANTHROPIC_API_KEY"` → env var not set / not redeployed.
   - `4xx` model error → the quality model ID; confirm `ANTHROPIC_MODEL_QUALITY` is set.
   - `429` → monthly quota hit (`AI_MONTHLY_LIMIT`).

Only after `POST /api/ai` → 200 with a real roadmap, invite your tester.

---

## 5. What your tester experiences

- They open the URL and can **use everything as a guest immediately** (local, offline).
- To **generate a real roadmap they must sign in with Google** — guests get
  `401` from the AI proxy by design (that's the identity/cost gate).
- Their signed-in data lives in **your** Supabase, isolated from yours by Row-Level
  Security (each row scoped to their `user_id`).

---

## Cost (read this)

Real mode spends **your** Anthropic key. One roadmap generation is several model calls,
and every tester generation bills to your account. `AI_MONTHLY_LIMIT` caps calls
**per user per month** (default 100) — for a single beta tester, consider setting it to
something like `30–50` so a runaway loop can't surprise you. Watch usage in the
Anthropic console for the first few sessions.

---

## Known caveat

`api/ai.ts` has not run on Vercel before — the local dev proxy (`vite.config.ts`) is the
only place this contract has executed. Expect possible first-deploy debugging around env
wiring or the edge runtime. Everything else (auth, data, migration) is verified live.
