// api/ai.ts — Vercel Edge Function: the PRODUCTION AI key vault + proxy.
//
// ADR-0003 step 2. This is the go-live counterpart to the local dev proxy in
// vite.config.ts: both serve the same-origin POST /api/ai that AnthropicProvider
// calls, so the browser contract is identical and nothing downstream (engine,
// parsers, store, UI) moves. The difference is where each runs and what it guards:
//   - vite proxy  : local dev only; holds the key; NO auth (so signed-out local
//                   iteration keeps working).
//   - this edge fn: deployed; holds the key; REQUIRES a valid Supabase JWT — this
//                   is the single choke point where identity is enforced and, at
//                   step 4, quota/metering/billing will live.
//
// The Anthropic key lives ONLY in this function's server env (never VITE_-prefixed,
// never in the browser bundle). Verifying the JWT here is what makes "runs on OUR
// key, gated and metered" true. Non-streaming { text } response — the same contract
// MockAI and AnthropicProvider already speak; streaming stays a later, opt-in change.

export const config = { runtime: 'edge' }

const DEFAULT_MODEL_QUALITY = 'claude-sonnet-5'
const DEFAULT_MODEL_FAST = 'claude-haiku-4-5-20251001'
const DEFAULT_MAX_TOKENS = 4096
// Free-tier cap: AI generations per user per calendar month, overridable via env.
const DEFAULT_MONTHLY_LIMIT = 100

interface ProxyRequestBody {
  system?: string
  messages?: unknown
  maxTokens?: number
  tier?: string
}
interface AnthropicTextBlock {
  type: string
  text?: string
}
interface AnthropicMessagesResponse {
  content?: AnthropicTextBlock[]
  error?: { message?: string }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// Server env, read from the function's runtime environment (set in the Vercel
// dashboard). The Supabase values fall back to the VITE_-prefixed names so a single
// pair of project values can serve both the client and this function if preferred.
function env(key: string): string | undefined {
  return (globalThis as { process?: { env: Record<string, string | undefined> } })
    .process?.env[key]
}

function resolveModel(tier: string | undefined): string {
  const forced = env('ANTHROPIC_MODEL')
  if (forced) return forced
  if (tier === 'fast') return env('ANTHROPIC_MODEL_FAST') || DEFAULT_MODEL_FAST
  return env('ANTHROPIC_MODEL_QUALITY') || DEFAULT_MODEL_QUALITY
}

// Verify the caller's Supabase JWT by asking Supabase whom it belongs to. Using the
// Auth REST endpoint (rather than locally checking the HS256 signature) needs no JWT
// secret and honours revocation/expiry for free. Returns the user id, or null when
// the token is missing/invalid/expired or Supabase isn't configured on the server.
async function verifyUserId(token: string): Promise<string | null> {
  const url = env('SUPABASE_URL') ?? env('VITE_SUPABASE_URL')
  const anon = env('SUPABASE_ANON_KEY') ?? env('VITE_SUPABASE_ANON_KEY')
  if (!url || !anon || !token) return null
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const user = (await res.json()) as { id?: string }
    return user.id ?? null
  } catch {
    return null
  }
}

function monthlyLimit(): number {
  const raw = env('AI_MONTHLY_LIMIT')
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MONTHLY_LIMIT
}

// Atomically count this request against the user's monthly quota via the Postgres
// RPC (consume_ai_quota). Returns the RPC's verdict, or null on an infrastructure
// error (RPC missing, network) — the caller FAILS OPEN on null so a not-yet-applied
// 0003 migration never breaks AI; it enforces ONLY an explicit `allowed: false`.
async function consumeQuota(
  token: string,
): Promise<{ allowed: boolean; used: number; limit: number } | null> {
  const url = env('SUPABASE_URL') ?? env('VITE_SUPABASE_URL')
  const anon = env('SUPABASE_ANON_KEY') ?? env('VITE_SUPABASE_ANON_KEY')
  if (!url || !anon) return null
  try {
    const res = await fetch(`${url}/rest/v1/rpc/consume_ai_quota`, {
      method: 'POST',
      headers: {
        apikey: anon,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_limit: monthlyLimit() }),
    })
    if (!res.ok) return null
    // A table-returning RPC yields an array of rows.
    const rows = (await res.json()) as
      | { allowed?: boolean; used?: number; quota_limit?: number }[]
      | null
    const row = Array.isArray(rows) ? rows[0] : null
    if (!row || typeof row.allowed !== 'boolean') return null
    return {
      allowed: row.allowed,
      used: row.used ?? 0,
      limit: row.quota_limit ?? monthlyLimit(),
    }
  } catch {
    return null
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' })

  const apiKey = env('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return json(500, {
      error: 'Server is missing ANTHROPIC_API_KEY. Set it in the deployment env.',
    })
  }

  // (a) Must be logged in — verify the Supabase JWT the client attached.
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const userId = await verifyUserId(token)
  if (!userId) return json(401, { error: 'Please sign in to use AI.' })

  // (b) Quota check — count this call against the user's monthly free-tier cap
  // (ADR-0003 step 4). Fails open on infra error (see consumeQuota); enforces only
  // an explicit denial. A paid tier later just raises AI_MONTHLY_LIMIT.
  const quota = await consumeQuota(token)
  if (quota && !quota.allowed) {
    return json(429, {
      error: `You've reached this month's AI limit (${quota.limit} generations). It resets at the start of next month.`,
    })
  }

  // (c) Forward to Anthropic and return its text. Mirrors the vite dev proxy exactly.
  try {
    const body = (await req.json()) as ProxyRequestBody
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: resolveModel(body.tier),
        max_tokens:
          typeof body.maxTokens === 'number' ? body.maxTokens : DEFAULT_MAX_TOKENS,
        system: body.system ?? '',
        messages: body.messages ?? [],
      }),
    })
    const data = (await upstream.json()) as AnthropicMessagesResponse
    if (!upstream.ok) {
      return json(upstream.status, {
        error: data.error?.message ?? 'AI request failed.',
      })
    }
    const text = (data.content ?? [])
      .filter(
        (b): b is AnthropicTextBlock =>
          b.type === 'text' && typeof b.text === 'string',
      )
      .map((b) => b.text as string)
      .join('')
    return json(200, { text })
  } catch (err) {
    return json(500, {
      error: err instanceof Error ? err.message : 'AI proxy error.',
    })
  }
}
