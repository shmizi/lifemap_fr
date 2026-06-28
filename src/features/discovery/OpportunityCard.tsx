// OpportunityCard — one discovered opportunity: what it is, how it matches the
// user's goals, and the three things they can do with it (open it, add it to
// their plan, dismiss it). Permanent removal lives behind the same two-step
// confirm convention as elsewhere, via RowActions' delete.
//
// Mostly presentation. The only writes are store actions (markAddedToRoadmap /
// dismissOpportunity / removeOpportunity) called directly, the same way
// MilestoneCard calls removeMilestone — cards are allowed to trigger store
// actions, never repositories.

import { useState } from 'react'
import { Calendar, Check, ExternalLink, MapPin, Sparkles, X } from 'lucide-react'
import { format } from 'date-fns'
import type { ID, Opportunity } from '@/core/types'
import { OPPORTUNITY_TYPE_LABELS } from '@/core/constants'
import { safeExternalUrl } from '@/core/utils/safeUrl'
import { MATCH_THRESHOLD } from '@/engine/discovery/scoreRelevance'
import { useDiscoveryStore } from '@/store/useDiscoveryStore'
import { AddToPlanModal } from '@/features/discovery/AddToPlanModal'

interface OpportunityCardProps {
  opportunity: Opportunity
  // Resolves matchedGoalIds to goal titles for display. Ids whose goal no longer
  // exists (deleted since the match) are simply skipped — never shown as blanks.
  goalTitleById: Record<ID, string>
}

// Turn the 0..1 relevance into a calm qualitative band. MATCH_THRESHOLD is the
// floor at which a goal is considered matched at all, so it anchors the bands.
function relevanceBand(score: number | undefined): { label: string; strong: boolean } {
  const s = score ?? 0
  if (s >= 0.6) return { label: 'Strong match', strong: true }
  if (s >= MATCH_THRESHOLD) return { label: 'Good match', strong: true }
  if (s > 0) return { label: 'Loose match', strong: false }
  return { label: 'No current match', strong: false }
}

export function OpportunityCard({ opportunity, goalTitleById }: OpportunityCardProps) {
  const dismissOpportunity = useDiscoveryStore((s) => s.dismissOpportunity)
  const removeOpportunity = useDiscoveryStore((s) => s.removeOpportunity)
  const [isBusy, setIsBusy] = useState(false)
  const [isPlanOpen, setIsPlanOpen] = useState(false)

  // Only render the Open link for a safe http(s) URL — a javascript:/data: URL in
  // an href would execute on click (React does not block it), and an opportunity's
  // URL is user/provider-supplied. Non-web URLs simply show no Open button.
  const linkUrl = safeExternalUrl(opportunity.url)

  const band = relevanceBand(opportunity.relevanceScore)
  const matchedTitles = opportunity.matchedGoalIds
    .map((id) => goalTitleById[id])
    .filter((title): title is string => title !== undefined)

  async function runAction(action: () => Promise<void>) {
    if (isBusy) return
    setIsBusy(true)
    try {
      await action()
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <article className="rounded-app-lg border border-app-border bg-app-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-app-border px-2 py-0.5 text-[11px] font-medium text-app-text-muted">
            {OPPORTUNITY_TYPE_LABELS[opportunity.type]}
          </span>
          {opportunity.source === 'ai_search' ? (
            <span
              title="Found by AI discovery"
              className="inline-flex items-center gap-1 rounded-full border border-app-border px-2 py-0.5 text-[11px] text-app-text-muted"
            >
              <Sparkles size={11} aria-hidden="true" />
              AI
            </span>
          ) : null}
        </div>
        <span
          className={[
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
            band.strong
              ? 'bg-app-surface-alt text-app-primary'
              : 'border border-app-border text-app-text-muted',
          ].join(' ')}
        >
          {band.label}
        </span>
      </div>

      <h3 className="mt-2 text-sm font-semibold text-app-text">{opportunity.title}</h3>
      <p className="mt-0.5 text-xs text-app-text-muted">{opportunity.organization}</p>

      {opportunity.description ? (
        <p className="mt-2 text-sm text-app-text-muted">{opportunity.description}</p>
      ) : null}

      {/* Meta line: deadline + location, only when present. */}
      {(opportunity.deadline || opportunity.location) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-app-text-muted">
          {opportunity.deadline ? (
            <span className="inline-flex items-center gap-1">
              <Calendar size={12} aria-hidden="true" />
              Closes {format(new Date(opportunity.deadline), 'MMM d, yyyy')}
            </span>
          ) : null}
          {opportunity.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} aria-hidden="true" />
              {opportunity.location}
            </span>
          ) : null}
        </div>
      )}

      {/* The discovery question made concrete: which of the user's goals this
          supports. Hidden entirely when nothing matched (no empty "Matches:"). */}
      {matchedTitles.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-app-text-muted">Supports</span>
          {matchedTitles.map((title) => (
            <span
              key={title}
              className="rounded-full bg-app-surface-alt px-2 py-0.5 text-[11px] text-app-text"
            >
              {title}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {linkUrl ? (
          <a
            href={linkUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-app-lg border border-app-border px-3 py-1.5 text-xs font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          >
            <ExternalLink size={13} aria-hidden="true" />
            Open
          </a>
        ) : null}

        {opportunity.addedToRoadmap ? (
          <span className="inline-flex items-center gap-1.5 rounded-app-lg px-3 py-1.5 text-xs font-medium text-app-primary">
            <Check size={13} aria-hidden="true" />
            Added to plan
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setIsPlanOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-app-lg bg-app-text px-3 py-1.5 text-xs font-semibold text-app-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          >
            <Check size={13} aria-hidden="true" />
            Add to plan
          </button>
        )}

        <button
          type="button"
          disabled={isBusy}
          onClick={() => runAction(() => dismissOpportunity(opportunity.id))}
          className="inline-flex items-center gap-1.5 rounded-app-lg px-3 py-1.5 text-xs font-medium text-app-text-muted transition hover:text-app-text disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        >
          <X size={13} aria-hidden="true" />
          Dismiss
        </button>

        {/* Permanent removal sits to the far right, separated, two-step confirm. */}
        <div className="ml-auto">
          <RemoveButton
            disabled={isBusy}
            onConfirm={() => runAction(() => removeOpportunity(opportunity.id))}
          />
        </div>
      </div>

      {/* Pick a goal and materialise this opportunity into a subgoal + Apply task. */}
      <AddToPlanModal
        open={isPlanOpen}
        onClose={() => setIsPlanOpen(false)}
        opportunity={opportunity}
      />
    </article>
  )
}

// Two-step delete confirm (the app-wide convention: destructive actions are never
// a single click). Local, because the opportunity actions don't fit RowActions'
// edit+delete shape.
function RemoveButton({
  disabled,
  onConfirm,
}: {
  disabled: boolean
  onConfirm: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setConfirming(true)}
        className="text-xs font-medium text-app-text-muted transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
      >
        Remove
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        type="button"
        disabled={disabled}
        onClick={onConfirm}
        className="font-semibold text-red-600 transition hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
      >
        Confirm
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-app-text-muted transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
      >
        Cancel
      </button>
    </div>
  )
}
