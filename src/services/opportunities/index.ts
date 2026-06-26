// services/opportunities/index.ts — the single place the rest of the app gets its
// search provider, and the ONE line that decides which backend answers.
//
// The store imports `searchProvider` (typed as the SearchProvider interface) from
// here and never knows the concrete implementation. Today that is MockSearch; when
// a provider is chosen it becomes Tavily/Firecrawl. Because the type is the
// interface, that swap is a one-line change in THIS file — the store, engine
// prompts, and parsers are untouched. Mirrors services/ai/index.ts.

import type { SearchProvider } from '@/services/opportunities/SearchProvider'
import { MockSearch } from '@/services/opportunities/MockSearch'

export type { SearchProvider } from '@/services/opportunities/SearchProvider'

// The app-wide search-provider singleton. Swap the right-hand side to the real
// provider when chosen; the `SearchProvider` annotation guarantees the
// replacement satisfies the same contract.
export const searchProvider: SearchProvider = new MockSearch()
