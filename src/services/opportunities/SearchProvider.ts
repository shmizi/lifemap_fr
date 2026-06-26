// services/opportunities/SearchProvider.ts — the contract every web-search backend
// must satisfy (Phase 6). The discovery flow's FIRST external boundary: turn a
// query into raw web results.
//
// The store depends on THIS interface, never a concrete provider, so swapping
// MockSearch for Tavily/Firecrawl changes only services/opportunities/index.ts —
// no store, engine, prompt, or parser code moves. This mirrors services/ai/
// AIProvider exactly: same seam shape, a different external service.
//
// The transport type (RawSearchResult) is owned by the PURE engine
// (engine/ai/types), and imported here. That direction is deliberate and matches
// AIProvider: services depends on engine, never the reverse.

import type { RawSearchResult } from '@/engine/ai/types'

export interface SearchProvider {
  // Search the web for opportunities matching `query`; resolve to raw results.
  // Implementations own transport concerns only — STRUCTURING the results into
  // typed opportunities is the AI extraction step's job (engine/ai prompt +
  // parser), not the provider's, exactly as AIProvider leaves parsing to a parser.
  // May reject on a transport failure (network/auth for a real provider); the
  // caller decides how to surface that.
  search(query: string): Promise<RawSearchResult[]>
}
