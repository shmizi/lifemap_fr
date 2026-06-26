// Opportunity repository — all database access for the Opportunity entity
// (Phase 6 — Discovery).
//
// WHY this file exists:
// Per the data-flow rule (DB -> Repositories -> Engine -> Store -> UI), every
// read or write touching the `opportunities` store lives here. Nothing outside
// database/repositories/ may import `db` or query the table directly.
//
// Opportunity differs from the hierarchy entities in two ways that shape this file:
//   1. It has NO `updatedAt` and NO `order` (it is a flat, unordered catalogue of
//      discovered items, not a positioned child in a tree). Like Milestone, an
//      update stamps nothing. The one timestamp it owns is `savedAt`, set once at
//      creation — the moment the opportunity entered the user's world.
//   2. It is a LEAF with no descendants and participates in no dependency graph,
//      so deleteOpportunity is a plain delete — no cascade, no transaction.
//
// INDEXING (from stores.ts): opportunities = 'id' (primary key only). Every other
// dimension — dismissed/addedToRoadmap (booleans, not valid IndexedDB keys),
// relevanceScore (optional), matchedGoalIds (an array) — is filtered/sorted in
// memory, where the catalogue is small. See the schema note for the rationale.

import { nanoid } from 'nanoid';
import { db } from '../db';
import type { ID, Opportunity } from '@/core/types';

/**
 * Fields the CALLER provides. `id` and `savedAt` are generated here, so they are
 * omitted. The caller supplies the descriptive fields plus the matching results
 * (`relevanceScore`, `matchedGoalIds`) the store computes via the discovery
 * engine, and the lifecycle flags (`addedToRoadmap`, `dismissed`, `source`).
 */
export type CreateOpportunityInput = Omit<Opportunity, 'id' | 'savedAt'>;

/** Patchable fields. id/savedAt are immutable facts, managed by the repository. */
export type UpdateOpportunityInput = Partial<Omit<Opportunity, 'id' | 'savedAt'>>;

/**
 * Save a newly discovered (or manually added) opportunity.
 *
 * WHY: callers describe an opportunity in domain terms; we own the plumbing —
 * the primary key and the `savedAt` stamp — so every row in the table is
 * well-formed and the rest of the app can trust those fields always exist.
 */
export async function createOpportunity(
  input: CreateOpportunityInput,
): Promise<Opportunity> {
  // ISO 8601 string: sortable as plain text, so "most recently saved" ordering is
  // a lexicographic compare with no Date parsing.
  const opportunity: Opportunity = {
    ...input,
    id: nanoid(),
    savedAt: new Date().toISOString(),
  };
  await db.opportunities.add(opportunity);
  return opportunity;
}

/** Fetch a single opportunity by primary key. Undefined (not an error) when unknown. */
export async function getOpportunityById(id: ID): Promise<Opportunity | undefined> {
  return db.opportunities.get(id);
}

/**
 * Fetch every opportunity, most recently saved first.
 *
 * WHY savedAt-desc and not relevance-desc: `relevanceScore` is optional and the
 * "natural" ordering is a presentation choice the store/UI can make per view (it
 * may want to drop dismissed ones, group by goal, or rank by relevance). The
 * repository returns a stable, always-defined default order; `savedAt` is set on
 * every row, so this never has to reason about undefined.
 *
 * WHY sort in memory: `savedAt` is not indexed (the schema keeps indexing
 * minimal). ISO strings sort lexicographically = chronologically, and the
 * catalogue is small, so an in-memory sort is cheaper than a dedicated index.
 */
export async function getAllOpportunities(): Promise<Opportunity[]> {
  const all = await db.opportunities.toArray();
  return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/**
 * Apply a partial update to an opportunity.
 *
 * WHY throw on a missing id: updating a non-existent opportunity is a programming
 * error the caller should hear about, not swallow — same contract as updateGoal /
 * updateTask. Unlike those, there is no `updatedAt` to refresh (Opportunity has
 * none, like Milestone), so the patch is applied verbatim.
 */
export async function updateOpportunity(
  id: ID,
  changes: UpdateOpportunityInput,
): Promise<void> {
  const updatedCount = await db.opportunities.update(id, changes);
  if (updatedCount === 0) {
    throw new Error(`updateOpportunity: no opportunity found with id "${id}"`);
  }
}

/**
 * Permanently remove an opportunity.
 *
 * WHY no cascade/transaction: an Opportunity is a leaf — it owns no child rows
 * and is not an endpoint in any dependency graph, so there is nothing to clean up
 * alongside it. Deleting an unknown id stays a no-op (Dexie's delete is idempotent).
 */
export async function deleteOpportunity(id: ID): Promise<void> {
  await db.opportunities.delete(id);
}
