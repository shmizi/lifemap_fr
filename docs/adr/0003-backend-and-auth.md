═══════════════════════════════════════════
ADR-0003: Backend, Auth & Multi-User Data (Go-Live Architecture)
═══════════════════════════════════════════
Status: Accepted (planned) — supersedes the "no backend before go-live" holds in
the Phase 5/6 notes. Not yet implemented; this locks the shape before any code.

Context
LifeMap has been built local-first: all data lives in the browser (Dexie /
IndexedDB), all AI runs through a provider seam (services/ai/AIProvider) currently
backed by MockAI, and there are no user accounts. To ship as a real product we
need three things the local-first build deliberately deferred:
  1. Identity — users log in; their data follows them across devices.
  2. Server-side AI — the Anthropic key (and Tavily/Firecrawl for Discovery) must
     NOT live in the browser bundle, and users must NOT bring their own key. The
     product runs on OUR key, gated and metered.
  3. Multi-tenant data — one datastore serving every user with hard isolation.

The whole point of the layered architecture (Database → Repositories → Engine →
Store → Hook → UI) and the AIProvider seam was to make this swap contained.

Decision
Adopt a managed, serverless backend — no servers we run, staying inside the
locked stack (no Docker, no backend framework):

  • Supabase  — Auth (Google OAuth + email magic-link) + Postgres + Row-Level
                Security. RLS is the multi-tenant mechanism: every row carries
                user_id, and the policy `user_id = auth.uid()` makes cross-user
                reads physically impossible. Supabase is the option the locked
                stack singled out as allowed "Phase 6+, when explicitly instructed"
                — this ADR is that instruction.
  • Vercel Edge Functions — the key vault + AI/search proxy. Holds the Anthropic,
                Tavily, and Firecrawl keys. Every call: (a) verifies the Supabase
                JWT (must be logged in), (b) checks the user's quota, (c) calls the
                upstream and streams back. This is the single point where cost
                control, rate-limiting, usage metering, and billing live.

Data ownership: SERVER-AUTHORITATIVE to start.
Postgres is the source of truth; Dexie is demoted to an optional local read-cache.
Rationale: LifeMap data is single-user (your own goals — no collaboration, no
shared documents), so the conflict surface for true local-first sync is tiny and
not worth its complexity now. Start simple (server-authoritative + thin cache for
snappiness); revisit full offline local-first sync only if offline use becomes a
real, stated requirement — NOT speculatively.

Why this is a contained change (the architecture was built for it)
- repositories/ is the ONLY layer that touches storage today. Going server-backed
  = reimplementing THAT layer against Supabase. Engine, store, hooks, UI, and the
  AIProvider seam do not move.
- The AI swap is the one-line change already designed into services/ai/index.ts:
  MockAI → a real provider that calls the Vercel edge proxy. Prompt builders,
  parsers, store, and UI are untouched.

Edition ordinal (resolves the open item from the colophon work)
"Vol. <YY> · Ed. <n>" — the edition ordinal ("Nth user to join") is un-knowable
client-side and currently defaults to 1 (see core/utils/colophon.ts). Under this
ADR it becomes a Postgres sequence/counter assigned by a signup trigger and stored
on the user's profiles row (edition, joined_year). registryColophon then reads the
real values.

Sequencing (each step ships independently; nothing downstream of repositories/ or
AIProvider changes):
  1. Auth — Supabase Auth + a profiles table + the edition counter. Login works;
     no data moved yet.
  2. AI proxy — the JWT-verified Vercel Edge Function holding the keys; flip
     AIProvider to it. Real-product AI; data still local.
  3. Data — reimplement repositories/ against Supabase with RLS; one-time import of
     the user's existing local Dexie data into their account on first login.
  4. Billing/quota — meter at the proxy; free tier (N generations/month) + paid.

Consequences
- New external dependencies: Supabase (auth/db) and Vercel Edge Functions (proxy).
  Both are hosted; neither is a framework or container we operate.
- Data leaves the device (privacy posture changes) — call this out in-product;
  RLS + Supabase's encryption-at-rest are the safeguards.
- A network round-trip enters the read path; the Dexie cache keeps the UX instant.
- Cost becomes usage-driven and bounded by the per-user quota enforced at the edge.

Explicitly NOT chosen / deferred
- Self-hosted backend, any backend framework, Docker — excluded by the locked stack.
- True local-first sync with conflict resolution — deferred (single-user data makes
  it low-value now).
- Real-time / collaboration / WebSockets — out of scope; LifeMap is single-user.
═══════════════════════════════════════════
