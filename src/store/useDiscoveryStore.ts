// Discovery store — the single place the UI reads discovered opportunities from,
// and the only place (besides repositories) that orchestrates opportunity writes.
//
// Locked data flow: Database -> Repositories -> Engine -> Store -> Hook -> UI.
// Kept SEPARATE from useGoalStore on purpose (the useDependencyStore precedent):
// opportunities are an external catalogue matched AGAINST the goal hierarchy, not
// a part of it. Repositories supply persistence; the pure discovery engine
// (scoreRelevance) does the matching math; this store only orchestrates and caches.
//
// WHERE THE CLOCK IS READ: relevance depends on whether an opportunity's deadline
// has passed, so scoring needs "today". `new Date()` is read HERE (store side) and
// passed into the engine, never read inside the engine — same discipline as
// generateDailyPlan in useGoalStore.
//
// CROSS-STORE WRITE (addToPlan): materialising an accepted opportunity into a real
// subgoal + task is the goal hierarchy's job, so addToPlan calls useGoalStore's
// addSubgoal/addTask (which own `order` and the post-write refreshes) via
// getState() — a deliberate ONE-WAY dependency (useGoalStore never imports this
// store), so there is no cycle. This store stays the owner of the opportunity row
// (it sets addedToRoadmap); useGoalStore stays the owner of the hierarchy.

import { create } from 'zustand'
import { format } from 'date-fns'
import type { ID, Opportunity, Subgoal } from '@/core/types'
import {
  createOpportunity,
  deleteOpportunity,
  getAllGoals,
  getAllOpportunities,
  updateOpportunity,
} from '@/database/repositories'
import {
  DEFAULT_SUBGOAL_STATUS,
  DEFAULT_TASK_STATUS,
  DEFAULT_TASK_PRIORITY,
} from '@/core/constants'
import {
  scoreRelevance,
  type GoalProfile,
} from '@/engine/discovery/scoreRelevance'
import {
  buildOpportunityExtractionPrompt,
  EXTRACTED_OPPORTUNITY_COUNT,
} from '@/engine/ai/prompts/opportunities'
import { parseOpportunityCandidates } from '@/engine/ai/parsers/opportunities'
import { aiProvider } from '@/services/ai'
import { searchProvider } from '@/services/opportunities'
import { useGoalStore } from '@/store/useGoalStore'

// Compose the subgoal description from an opportunity, folding in the organization
// and link so neither is lost when it becomes a plan item (the subgoal model has
// no url/organization fields of its own).
function composePlanDescription(opportunity: Opportunity): string {
  const parts: string[] = []
  if (opportunity.description.trim().length > 0) {
    parts.push(opportunity.description.trim())
  }
  const meta: string[] = []
  if (opportunity.organization.trim().length > 0) {
    meta.push(opportunity.organization.trim())
  }
  if (opportunity.url.trim().length > 0) meta.push(opportunity.url.trim())
  if (meta.length > 0) parts.push(meta.join(' — '))
  return parts.join('\n\n')
}

// What the caller hands the store to save a freshly discovered (or manually
// added) opportunity: the descriptive fields plus its `source`. The store
// computes `relevanceScore` + `matchedGoalIds` via the engine and defaults the
// lifecycle flags, so those are NOT part of the input (it owns them).
export type DiscoveredOpportunityInput = Omit<
  Opportunity,
  | 'id'
  | 'savedAt'
  | 'relevanceScore'
  | 'matchedGoalIds'
  | 'addedToRoadmap'
  | 'dismissed'
>

interface DiscoveryState {
  // The saved catalogue, most-recently-saved first (repository order). Dismissed
  // opportunities are KEPT here (the flag is on the row); a view decides whether
  // to hide them, per the one-question-per-screen principle.
  opportunities: Opportunity[]
  isLoadingOpportunities: boolean
  // True while a discovery run (search -> extract -> score -> save) is in flight,
  // so the UI can show progress and disable a second concurrent run.
  isDiscovering: boolean

  loadOpportunities: () => Promise<void>
  saveOpportunity: (input: DiscoveredOpportunityInput) => Promise<Opportunity>
  // Run the full discovery pipeline for a query and persist the new finds.
  // Resolves to how many fresh opportunities were added (after dedup).
  discoverOpportunities: (query: string) => Promise<number>
  dismissOpportunity: (id: ID) => Promise<void>
  markAddedToRoadmap: (id: ID) => Promise<void>
  // Materialise an accepted opportunity into the plan: create a subgoal (carrying
  // the opportunity's deadline as its target date) plus a starter "Apply" task
  // under the chosen goal, then flag the opportunity added. Returns the new subgoal.
  addToPlan: (opportunity: Opportunity, goalId: ID) => Promise<Subgoal>
  removeOpportunity: (id: ID) => Promise<void>
}

export const useDiscoveryStore = create<DiscoveryState>()((set, get) => {
  // Re-fetch the catalogue in place (no loading-flag flip -> no flicker),
  // mirroring useDependencyStore.refreshLoaded. Called after every mutation so the
  // cached list never drifts from the table.
  const refresh = async (): Promise<void> => {
    set({ opportunities: await getAllOpportunities() })
  }

  return {
    opportunities: [],
    isLoadingOpportunities: false,
    isDiscovering: false,

    // First load: flips the loading flag for the initial paint (use on mount of a
    // discovery view), like loadDependencies / loadGoalTree.
    loadOpportunities: async () => {
      set({ isLoadingOpportunities: true })
      try {
        set({ opportunities: await getAllOpportunities() })
      } finally {
        set({ isLoadingOpportunities: false })
      }
    },

    // Score the candidate against the user's CURRENT goals, then persist it with
    // the computed relevance + matched goals and default (not-yet-acted-on)
    // lifecycle flags. The engine is pure and time-injected: the store fetches the
    // goals, reads the clock, and hands both to scoreRelevance.
    saveOpportunity: async (input) => {
      const goals = await getAllGoals()
      const goalProfiles: GoalProfile[] = goals.map((g) => ({
        id: g.id,
        title: g.title,
        description: g.description,
        category: g.category,
      }))
      const today = format(new Date(), 'yyyy-MM-dd')

      const { relevanceScore, matchedGoalIds } = scoreRelevance(
        {
          type: input.type,
          title: input.title,
          description: input.description,
          tags: input.tags,
          deadline: input.deadline,
        },
        goalProfiles,
        today,
      )

      const created = await createOpportunity({
        ...input,
        relevanceScore,
        matchedGoalIds,
        addedToRoadmap: false,
        dismissed: false,
      })
      await refresh()
      return created
    },

    // The full discovery pipeline, one external boundary per step, both behind
    // swappable seams: search provider -> raw results -> AI extraction prompt ->
    // AI provider -> tolerant parser -> structured candidates. Each candidate is
    // then scored + persisted through the SAME saveOpportunity path (so found and
    // manual opportunities are stored identically). Candidates are deduped by url
    // against what is already saved AND within this batch, so a repeated search
    // does not pile up the same opportunity. Returns the count actually added.
    //
    // Errors from a real provider (network/auth) propagate to the caller; the
    // loading flag is always cleared. The parser is the resilience boundary for
    // malformed model output (it yields [] rather than throwing).
    discoverOpportunities: async (query) => {
      set({ isDiscovering: true })
      try {
        const results = await searchProvider.search(query)
        const response = await aiProvider.complete(
          buildOpportunityExtractionPrompt({ query, results }),
        )
        const candidates = parseOpportunityCandidates(
          response,
          EXTRACTED_OPPORTUNITY_COUNT,
        )

        // Seed the dedup set from the saved catalogue, then grow it as we add, so
        // duplicate urls within one batch are also collapsed.
        const seenUrls = new Set(get().opportunities.map((o) => o.url))
        let added = 0
        for (const candidate of candidates) {
          if (candidate.url.length === 0 || seenUrls.has(candidate.url)) continue
          seenUrls.add(candidate.url)
          // Sequential: saveOpportunity refreshes the cache each time, and
          // scoring reads the goal list; keeping it ordered avoids races.
          await get().saveOpportunity({ ...candidate, source: 'ai_search' })
          added += 1
        }
        return added
      } finally {
        set({ isDiscovering: false })
      }
    },

    // Lifecycle flags — each a single patch + in-place refresh. Idempotent on an
    // already-set flag (the patch just re-writes the same value).
    dismissOpportunity: async (id) => {
      await updateOpportunity(id, { dismissed: true })
      await refresh()
    },

    // Records the "Add to Plan" intent flag only. markAddedToRoadmap is the low-
    // level flag setter; addToPlan (below) is the full materialisation that also
    // calls it.
    markAddedToRoadmap: async (id) => {
      await updateOpportunity(id, { addedToRoadmap: true })
      await refresh()
    },

    // Turn an accepted opportunity into real plan work under the chosen goal. The
    // product shape (decided with the user): the deadline rides on the SUBGOAL as
    // its target date, and a plain "Apply" task makes it actionable. Both writes
    // go through useGoalStore so `order` and the hierarchy refreshes stay correct;
    // then the opportunity is flagged added (reusing markAddedToRoadmap).
    addToPlan: async (opportunity, goalId) => {
      const { addSubgoal, addTask } = useGoalStore.getState()
      const subgoal = await addSubgoal({
        goalId,
        title: opportunity.title,
        description: composePlanDescription(opportunity),
        status: DEFAULT_SUBGOAL_STATUS,
        requiresConsistency: false,
        // Deadline becomes the subgoal's target date; omit the field entirely when
        // there is none (rather than storing an empty string).
        ...(opportunity.deadline ? { targetDate: opportunity.deadline } : {}),
      })
      await addTask({
        subgoalId: subgoal.id,
        title: `Apply to ${opportunity.title}`,
        description:
          opportunity.url.trim().length > 0
            ? `Apply here: ${opportunity.url.trim()}`
            : undefined,
        status: DEFAULT_TASK_STATUS,
        priority: DEFAULT_TASK_PRIORITY,
        isRecurring: false,
      })
      await get().markAddedToRoadmap(opportunity.id)
      return subgoal
    },

    // Permanently drop an opportunity from the catalogue. Idempotent on unknown ids
    // (the repository's delete is).
    removeOpportunity: async (id) => {
      await deleteOpportunity(id)
      await refresh()
    },
  }
})
