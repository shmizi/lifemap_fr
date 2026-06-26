// Discovery page — opportunities (internships, scholarships, hackathons, ...)
// matched against the user's goals, answering "what real-world opportunity should
// I act on?" (Phase 6).
//
// Store-connected only: it loads the opportunity catalogue via useOpportunities
// and the goal list (to resolve matched-goal titles + give the manual-add form a
// reason to exist), then hands both to the pure DiscoveryView. No DB access, no
// scoring here — the store scores on save, the engine does the math.

import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import type { ID } from '@/core/types'
import { useGoalStore } from '@/store/useGoalStore'
import { useDiscoveryStore } from '@/store/useDiscoveryStore'
import { useOpportunities } from '@/core/hooks/useOpportunities'
import { DiscoveryView } from '@/features/discovery/DiscoveryView'
import { AddOpportunityModal } from '@/features/discovery/AddOpportunityModal'

export function DiscoveryPage() {
  const goals = useGoalStore((s) => s.goals)
  const loadGoals = useGoalStore((s) => s.loadGoals)
  const { opportunities, isLoading } = useOpportunities()
  const discoverOpportunities = useDiscoveryStore((s) => s.discoverOpportunities)
  const isDiscovering = useDiscoveryStore((s) => s.isDiscovering)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [query, setQuery] = useState('')

  // Goals power the matched-goal chips and the scoring done on save, so make sure
  // they are loaded when this page mounts.
  useEffect(() => {
    void loadGoals()
  }, [loadGoals])

  // id -> title lookup so a card can name the goals an opportunity supports
  // without each card re-deriving it.
  const goalTitleById = useMemo(() => {
    const map: Record<ID, string> = {}
    for (const goal of goals) map[goal.id] = goal.title
    return map
  }, [goals])

  // Run a discovery search. The store owns the whole pipeline; the page only
  // hands it the query and reflects the in-flight flag. A real provider's failure
  // would reject here — swallowed for now (the mock never throws); inline error
  // UX is a later polish.
  async function handleDiscover(event: FormEvent) {
    event.preventDefault()
    if (query.trim().length === 0 || isDiscovering) return
    try {
      await discoverOpportunities(query.trim())
    } catch {
      // best-effort; the loading flag is cleared in the store's finally.
    }
  }

  return (
    <section className="mx-auto max-w-3xl">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-app-text">Discovery</h1>
          <p className="mt-1 text-app-text-muted">
            Real-world opportunities, matched to the goals you are working toward.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        >
          <Plus size={16} aria-hidden="true" />
          Add opportunity
        </button>
      </header>

      {/* Discover bar: search the web (via the provider seam) for opportunities
          and add the relevant finds. Mocked today; a real provider drops in
          behind the same call. */}
      <form onSubmit={handleDiscover} className="mt-6 flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search opportunities, e.g. machine learning internships"
            className="w-full rounded-app-lg border border-app-border bg-app-surface py-2 pl-9 pr-3 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          />
        </div>
        <button
          type="submit"
          disabled={query.trim().length === 0 || isDiscovering}
          className="inline-flex shrink-0 items-center gap-2 rounded-app-lg border border-app-border px-4 py-2 text-sm font-semibold text-app-text transition hover:bg-app-border/30 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        >
          {isDiscovering ? 'Searching...' : 'Discover'}
        </button>
      </form>

      {isLoading && opportunities.length === 0 ? (
        <CenteredNote>Loading opportunities...</CenteredNote>
      ) : (
        <DiscoveryView opportunities={opportunities} goalTitleById={goalTitleById} />
      )}

      <AddOpportunityModal open={isAddOpen} onClose={() => setIsAddOpen(false)} />
    </section>
  )
}

function CenteredNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 rounded-app-lg border border-app-border bg-app-surface p-10 text-center text-sm text-app-text-muted">
      {children}
    </div>
  )
}
