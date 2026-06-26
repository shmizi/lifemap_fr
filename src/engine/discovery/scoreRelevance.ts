// scoreRelevance — match ONE discovered opportunity against the user's goals
// (Phase 6). PURE TypeScript: no React, no DB, no store, NO fetch.
//
// WHAT THIS IS: the deterministic floor of Discovery. A search provider
// (Tavily/Firecrawl in a later slice) finds candidate opportunities and Claude
// extracts their structured fields; THIS function then scores how relevant each
// candidate is to the goals the user actually holds, and decides which goals it
// supports. The two outputs map exactly onto the reserved Opportunity fields
// `relevanceScore` (0..1, "computed by matching engine") and `matchedGoalIds`.
//
// WHY a deterministic engine when Claude could also score: relevance must be
// explainable and reproducible. A pure, testable function gives a stable floor
// the UI can trust ("matched because the opportunity's terms appear in this
// goal, and an internship fits a career goal") without re-asking a model. Claude
// extracts the messy real-world text; the engine does the disciplined matching.
//
// TIME IS INJECTED: the only clock-dependent rule is freshness (a passed
// deadline makes an opportunity irrelevant). `today` is a parameter — the engine
// never reads Date.now(), same as every other engine module.

import type { GoalCategory, ID, ISODate, OpportunityType } from '@/core/types'

// ── Inputs ───────────────────────────────────────────────────────────────────
// Plain projections of Goal / Opportunity, NOT the full entities — so the pure
// function stays decoupled from persistence shapes and is trivial to unit-test
// on fixtures (the same approach as MilestoneSuggestionContext in engine/ai).

// What the matcher needs to know about ONE of the user's goals.
export interface GoalProfile {
  id: ID
  title: string
  description: string
  category: GoalCategory
}

// What the matcher needs to know about ONE candidate opportunity. These come
// from the provider/Claude extraction step; `deadline` (if known) gates
// freshness.
export interface OpportunityProfile {
  type: OpportunityType
  title: string
  description: string
  // Short topical labels (e.g. ['ML', 'Germany', 'paid']) — high-signal terms,
  // weighted the same as title terms in the overlap.
  tags: string[]
  deadline?: ISODate
}

export interface RelevanceResult {
  // 0..1 — how relevant this opportunity is to its single best-matching goal.
  relevanceScore: number
  // The goals this opportunity supports (per-goal score at/above the match
  // threshold), strongest first. Empty when nothing clears the bar.
  matchedGoalIds: ID[]
}

// ── Tuning (engine-internal) ─────────────────────────────────────────────────
// These weights are presentation-agnostic matching tuning, so they live WITH the
// function (like LAGGING_FOUNDATION_MARGIN_POINTS), not in core/constants — no UI
// reads them. They are exported so tests can reference them by name rather than
// hard-coding the numbers.

// A per-goal score blends two independent, each-explainable signals. The weights
// sum to 1 so a perfect match (right category AND every term lands) scores 1.0.
export const CATEGORY_AFFINITY_WEIGHT = 0.4
export const KEYWORD_OVERLAP_WEIGHT = 0.6

// A goal is "matched" only once its per-goal score clears this bar — enough that
// a single incidental shared word doesn't claim a match, low enough that a clear
// thematic overlap counts. Tunable; deliberately conservative.
export const MATCH_THRESHOLD = 0.3

// Which goal categories each kind of opportunity inherently serves. This is the
// "an internship fits a career goal" half of the score — true thematic affinity,
// independent of wording. 'other' opportunities assert no inherent affinity and
// rest entirely on keyword overlap. Exhaustive over OpportunityType so adding a
// type forces a deliberate choice here (the Record type makes omission a compile
// error).
export const OPPORTUNITY_CATEGORY_AFFINITY: Record<
  OpportunityType,
  ReadonlyArray<GoalCategory>
> = {
  internship: ['career', 'education', 'skills'],
  hackathon: ['skills', 'career', 'education'],
  scholarship: ['education', 'financial'],
  conference: ['career', 'education', 'skills', 'personal'],
  competition: ['skills', 'career'],
  program: ['education', 'career', 'skills', 'personal'],
  other: [],
}

// Low-signal words dropped before overlap so matches reflect topic, not grammar.
// Kept small on purpose: real stopword lists overreach; these are the connectors
// that would otherwise create spurious overlaps between unrelated text.
const STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'for', 'with', 'your', 'you', 'our', 'get', 'are', 'was',
  'has', 'have', 'this', 'that', 'from', 'into', 'will', 'can', 'all', 'any',
  'its', 'their', 'them', 'they', 'a', 'an', 'to', 'of', 'in', 'on', 'at',
  'by', 'or', 'as', 'is', 'be', 'we', 'my', 'it',
])

// Split free text into comparable terms: lowercase, alphanumeric runs only,
// drop single characters and stopwords. Two-letter terms are KEPT on purpose so
// high-signal acronyms like 'ai'/'ml' survive (the stopword set removes the
// noise that length-2 filtering would otherwise catch).
function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9]+/g)
  if (matches === null) return []
  return matches.filter((t) => t.length >= 2 && !STOPWORDS.has(t))
}

// Fraction of the opportunity's own terms that appear in the goal's text. Asking
// "how much of the opportunity is about this goal" (denominator = opportunity
// terms) is the right direction: a tightly-scoped opportunity whose every term
// lands in a goal is a strong match, even against a long goal description.
function overlapRatio(
  opportunityTerms: ReadonlySet<string>,
  goalTerms: ReadonlySet<string>,
): number {
  if (opportunityTerms.size === 0) return 0
  let shared = 0
  for (const term of opportunityTerms) {
    if (goalTerms.has(term)) shared += 1
  }
  return shared / opportunityTerms.size
}

// Is the opportunity still open as of `today`? A known deadline strictly before
// today means the window has closed — irrelevant regardless of topic. No
// deadline = treated as open (many opportunities list none). Both values are
// compared as date-only keys (YYYY-MM-DD), the same convention the dashboard
// windows use; ISO date strings sort lexicographically by calendar date.
function isExpired(deadline: ISODate | undefined, today: ISODate): boolean {
  if (deadline === undefined || deadline === '') return false
  return deadline.slice(0, 10) < today.slice(0, 10)
}

export function scoreRelevance(
  opportunity: OpportunityProfile,
  goals: ReadonlyArray<GoalProfile>,
  today: ISODate,
): RelevanceResult {
  // A closed opportunity is never relevant, however on-topic — surface it as a
  // clean "no match" so an expired result can't outrank a live one.
  if (isExpired(opportunity.deadline, today)) {
    return { relevanceScore: 0, matchedGoalIds: [] }
  }

  // The opportunity's terms: title + tags together (tags are already high-signal
  // topical labels, so they earn the same weight as title words).
  const opportunityTerms = new Set([
    ...tokenize(opportunity.title),
    ...opportunity.tags.flatMap(tokenize),
  ])

  // Score every goal independently, tracking the topical overlap separately so it
  // can gate matches (below).
  const scored: Array<{ id: ID; score: number; overlap: number }> = []
  for (const goal of goals) {
    const affinity = OPPORTUNITY_CATEGORY_AFFINITY[opportunity.type].includes(
      goal.category,
    )
      ? 1
      : 0
    const goalTerms = new Set([
      ...tokenize(goal.title),
      ...tokenize(goal.description),
    ])
    const overlap = overlapRatio(opportunityTerms, goalTerms)
    const score =
      CATEGORY_AFFINITY_WEIGHT * affinity + KEYWORD_OVERLAP_WEIGHT * overlap
    scored.push({ id: goal.id, score, overlap })
  }

  // A match REQUIRES a real topical tie (at least one shared term) AND a score
  // that clears the bar. Category affinity strengthens a match's score and its
  // ranking, but never asserts a match on its OWN: an internship sharing no
  // language with a goal is not evidence it "supports" that goal, and claiming so
  // would manufacture false relevance the user can't trust. So affinity is a
  // booster here, not a matcher.
  const matched = scored
    .filter((s) => s.overlap > 0 && s.score >= MATCH_THRESHOLD)
    // Strongest match first; id as a stable tiebreaker for deterministic output.
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  // Headline relevance = the strongest GOAL MATCH (0 when nothing matched), so the
  // single number the UI ranks/labels by never disagrees with the matched-goal
  // list: an opportunity that supports no goal reads as "no current match", not as
  // a confident score with nothing behind it.
  const relevanceScore = matched.length > 0 ? matched[0].score : 0

  return {
    relevanceScore,
    matchedGoalIds: matched.map((s) => s.id),
  }
}
