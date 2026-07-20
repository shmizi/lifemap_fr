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
import { RegistryPage, RegistryButton } from '@/components/ui/Registry'

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
    <RegistryPage
      kicker="LifeMap — Field Dispatches"
      title="Discovery"
      subtitle="Real-world opportunities, matched to your goals"
      actions={
        <RegistryButton onClick={() => setIsAddOpen(true)}>
          <Plus size={14} aria-hidden="true" />
          Add opportunity
        </RegistryButton>
      }
    >
      {/* Discover bar: search the web (via the provider seam) for opportunities
          and add the relevant finds. Mocked today; a real provider drops in
          behind the same call. */}
      <form onSubmit={handleDiscover} className="flex items-center gap-2">
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
            className="w-full border border-app-border bg-app-surface py-2 pl-9 pr-3 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          />
        </div>
        <RegistryButton
          type="submit"
          variant="secondary"
          disabled={query.trim().length === 0 || isDiscovering}
        >
          {isDiscovering ? 'Searching…' : 'Discover'}
        </RegistryButton>
      </form>

      <div className="mt-6">
        {isLoading && opportunities.length === 0 ? (
          <CenteredNote>Scanning the dispatches…</CenteredNote>
        ) : (
          <DiscoveryView opportunities={opportunities} goalTitleById={goalTitleById} />
        )}
      </div>

      <AddOpportunityModal open={isAddOpen} onClose={() => setIsAddOpen(false)} />
    </RegistryPage>
  )
}

function CenteredNote({ children }: { children: ReactNode }) {
  return (
    <div className="border border-app-border bg-app-surface p-10 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-app-text-muted">
      {children}
    </div>
  )
}
