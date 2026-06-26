// services/opportunities/MockSearch.ts — the development stand-in for a real web
// search provider (Tavily/Firecrawl), Phase 6.
//
// No network, no key — the search-provider choice waits, exactly like the AI key
// (see the provider-agnostic seam). It returns deterministic, query-flavoured raw
// results so the WHOLE discovery pipeline (search -> AI extraction -> parse ->
// score -> persist) runs end-to-end NOW. When a real provider lands,
// services/opportunities/index.ts swaps the export and nothing else moves.
//
// NOTE on the mock pipeline: these raw results flow into the extraction prompt,
// and MockAI returns query-flavoured candidates from it. The mock AI does not
// faithfully transcribe each result (a real model reading real Tavily output
// will) — what is being proven here is the WIRING: that results reach the prompt
// and structured candidates come back. Both stages are query-flavoured, so the
// demo stays coherent ("search ML -> get ML-flavoured opportunities").

import type { RawSearchResult } from '@/engine/ai/types'
import type { SearchProvider } from '@/services/opportunities/SearchProvider'

export class MockSearch implements SearchProvider {
  search(query: string): Promise<RawSearchResult[]> {
    const q = query.trim().length > 0 ? query.trim() : 'opportunities'
    const key = slug(q)
    // A handful of plausible, query-flavoured results. Deterministic so a
    // developer sees a stable list, and the titles echo the query so the pipeline
    // visibly responds to the input.
    const results: RawSearchResult[] = [
      {
        title: `${q} Summer Internship 2026`,
        url: `https://example.org/intern/${key}`,
        snippet: `A paid summer internship related to ${q}, open to students.`,
      },
      {
        title: `${q} Scholarship Program`,
        url: `https://example.org/scholarship/${key}`,
        snippet: `Funding for students pursuing ${q}; an application deadline applies.`,
      },
      {
        title: `International ${q} Hackathon`,
        url: `https://example.org/hackathon/${key}`,
        snippet: `A weekend hackathon focused on ${q}, open to all skill levels.`,
      },
    ]
    // Resolve async to mirror a real provider's Promise shape; no artificial delay
    // so tests stay fast.
    return Promise.resolve(results)
  }
}

// URL-safe slug of the query, so repeated identical queries yield identical urls
// (which the store's dedup-by-url then collapses).
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
