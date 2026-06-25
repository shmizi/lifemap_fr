// services/ai/index.ts — the single place the rest of the app gets its AI
// provider, and the ONE line that decides which backend answers.
//
// The store imports `aiProvider` (typed as the AIProvider interface) from here
// and never knows the concrete implementation. Today that is MockAI; in Phase 6
// it becomes an Anthropic-backed provider talking to the edge proxy. Because the
// type is the interface, that swap is a one-line change in THIS file — the
// store, engine prompts, and parsers are untouched.

import type { AIProvider } from '@/services/ai/AIProvider'
import { MockAI } from '@/services/ai/MockAI'

export type { AIProvider } from '@/services/ai/AIProvider'

// The app-wide provider singleton. Swap the right-hand side to the real provider
// when the Phase 6 key proxy exists; the `AIProvider` annotation guarantees the
// replacement satisfies the same contract.
export const aiProvider: AIProvider = new MockAI()
