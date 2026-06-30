// services/ai/index.ts — the single place the rest of the app gets its AI
// provider, and the ONE switch that decides which backend answers.
//
// The store imports `aiProvider` (typed as the AIProvider interface) from here
// and never knows the concrete implementation. The switch is the non-secret
// VITE_USE_REAL_AI flag: when "true", AI goes through AnthropicProvider -> the
// same-origin /api/ai dev proxy -> real Claude (the API key lives only in the
// proxy, never in this bundle). Anything else (including unset) uses MockAI, so
// the default build and any contributor without a key get deterministic mocks.
//
// Going to production (the deferred go-live phase) means standing up the same
// /api/ai path as a Vercel edge function and setting VITE_USE_REAL_AI=true there
// — no change to this file's logic, the engine, the parsers, or the store.

import type { AIProvider } from '@/services/ai/AIProvider'
import { MockAI } from '@/services/ai/MockAI'
import { AnthropicProvider } from '@/services/ai/AnthropicProvider'

export type { AIProvider } from '@/services/ai/AIProvider'

// The app-wide provider singleton. Real Claude only when explicitly enabled AND
// not under test — tests must never hit the network (the /api/ai proxy doesn't
// exist there, and a relative fetch has no base URL in Node), so they always get
// the deterministic MockAI regardless of what a local .env sets.
const useRealAI =
  import.meta.env.VITE_USE_REAL_AI === 'true' && import.meta.env.MODE !== 'test'

export const aiProvider: AIProvider = useRealAI
  ? new AnthropicProvider()
  : new MockAI()
