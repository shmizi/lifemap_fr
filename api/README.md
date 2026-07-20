# AI proxy — ADR-0003 step 2

[`ai.ts`](ai.ts) is a **Vercel Edge Function** that serves `POST /api/ai` in
production: it holds the Anthropic key, requires a valid Supabase JWT, and forwards
to Anthropic. It is the go-live twin of the local dev proxy in `vite.config.ts` —
same browser contract (`AnthropicProvider` → `/api/ai` → `{ text }`), so the engine,
parsers, store, and UI don't change.

| | Local dev (`vite`) | Production (`api/ai.ts` on Vercel) |
|---|---|---|
| Serves `/api/ai` | Vite middleware | Vercel Edge Function |
| Holds `ANTHROPIC_API_KEY` | ✅ (`.env`) | ✅ (Vercel env) |
| Requires sign-in | ❌ (keyless-auth for iteration) | ✅ **valid Supabase JWT** |

**Consequence:** once deployed, using AI **requires signing in** (ADR-0003: "runs on
OUR key, gated and metered"). Viewing local data stays usable signed-out; the AI
actions return `401 "Please sign in to use AI."` until the user signs in. Locally,
AI keeps working signed-out through the vite proxy.

## Deploy

1. Push the repo to a **Vercel** project. Vercel auto-detects Vite (build `vite build`,
   output `dist`) and the `api/` directory as functions — no `vercel.json` needed.
2. Set **Environment Variables** (Project → Settings → Environment Variables). These
   are **server-side** — do NOT prefix with `VITE_` (that would leak into the bundle):

   | Variable | Purpose |
   |---|---|
   | `ANTHROPIC_API_KEY` | the key the proxy spends (required) |
   | `SUPABASE_URL` | your project URL, for JWT verification (or reuse `VITE_SUPABASE_URL`) |
   | `SUPABASE_ANON_KEY` | anon key, for JWT verification (or reuse `VITE_SUPABASE_ANON_KEY`) |
   | `ANTHROPIC_MODEL_QUALITY` / `ANTHROPIC_MODEL_FAST` / `ANTHROPIC_MODEL` | optional model overrides |
   | `AI_MONTHLY_LIMIT` | optional free-tier cap (generations/user/month; default `100`) |
   | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | client auth (step 1) — must also be set here so the deployed app can sign in |

   The function reads `SUPABASE_URL`/`SUPABASE_ANON_KEY` and falls back to the
   `VITE_`-prefixed values, so setting only the `VITE_` pair also works.
3. Redeploy. Sign in (Settings → Account), then run any AI action.

## How JWT verification works

The client (`AnthropicProvider`) attaches `Authorization: Bearer <access_token>` from
the current Supabase session. The function calls `GET {SUPABASE_URL}/auth/v1/user`
with that token to confirm it's valid (no JWT secret needed; expiry/revocation are
honoured), and rejects with `401` if not.

## Quota / metering (step 4)

Right after verification, the function calls the `consume_ai_quota(limit)` Postgres
RPC (from [`../supabase/migrations/0003_ai_usage.sql`](../supabase/migrations/0003_ai_usage.sql))
to atomically count the request against the user's monthly cap. Over the limit → the
proxy returns `429` and `AnthropicProvider` surfaces the message inline in the AI
modals. Notes:

- **Run `0003_ai_usage.sql`** to enable enforcement. Until you do, the proxy **fails
  open** (AI works, unmetered) — a missing migration never breaks the app.
- The cap is `AI_MONTHLY_LIMIT` (default `100`) generations per calendar month; a
  paid tier is just a higher limit.
- A request is counted when it's *admitted* (before the upstream call), so a failed
  Anthropic call still consumes one — acceptable for a simple free-tier meter.
