// DiscoveryView — the list of opportunities, most relevant first, each shown as
// an OpportunityCard. Pure presentation: it receives the loaded catalogue and a
// goal-title lookup, and decides ordering and what to hide. No store/DB access.
//
// ORDERING + FILTERING are presentation choices made here (not in the store):
// dismissed opportunities drop out of the main list (the screen answers "what is
// worth my attention", per one-question-per-screen), and the rest sort by
// relevance descending so the strongest matches lead.

import { useMemo } from 'react'
import type { ID, Opportunity } from '@/core/types'
import { OpportunityCard } from './OpportunityCard'

interface DiscoveryViewProps {
  opportunities: Opportunity[]
  goalTitleById: Record<ID, string>
}

export function DiscoveryView({ opportunities, goalTitleById }: DiscoveryViewProps) {
  const visible = useMemo(() => {
    return opportunities
      .filter((o) => !o.dismissed)
      // Strongest match first; the repository already returns savedAt-desc, so a
      // stable sort keeps newest-first as the tiebreaker within equal scores.
      .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
  }, [opportunities])

  if (visible.length === 0) {
    return (
      <div className="mt-8 rounded-app-lg border border-dashed border-app-border bg-app-surface p-10 text-center">
        <h2 className="text-base font-semibold text-app-text">
          No opportunities yet
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-app-text-muted">
          Add an internship, scholarship, or competition you have found, and it
          will be matched against your goals. AI-powered discovery is coming.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-3">
      {visible.map((opportunity) => (
        <OpportunityCard
          key={opportunity.id}
          opportunity={opportunity}
          goalTitleById={goalTitleById}
        />
      ))}
    </div>
  )
}
