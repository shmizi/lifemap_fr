/**
 * Dependency repository — all database access for the Dependency entity.
 *
 * WHY this file exists:
 * Per the data-flow rule (DB -> Repositories -> Engine -> Store -> UI), every
 * read or write touching the `dependencies` store lives here. Nothing outside
 * database/repositories/ may import `db` or query the table directly.
 *
 * SCOPE BOUNDARY (Phase 3, data layer only):
 * This is PURE data access. There is deliberately NO cycle detection, NO
 * topological ordering, NO validation that fromId/toId actually match the
 * declared `type`, and NO "what happens to an edge when one side is deleted"
 * logic. Those are rules; rules live in engine/dependencies/ (later), never in
 * a repository. A Dependency edge means "fromId must complete before toId".
 *
 * Mirrors the Milestone repository's identity convention: Dependency has NO
 * `updatedAt`, so we stamp `createdAt` on create and never maintain an updated
 * timestamp. Edges are immutable once created — there is no updateDependency;
 * callers delete and re-create rather than patch an edge in place.
 */

import { nanoid } from 'nanoid';
import { db } from '@/database/db';
import type { ID, Dependency } from '@/core/types';

/**
 * Fields the CALLER must provide. id and createdAt are generated here, so they
 * are omitted from the input. The caller supplies fromId, toId, and type — the
 * repository does not invent relationships.
 */
export type CreateDependencyInput = Omit<Dependency, 'id' | 'createdAt'>;

export async function createDependency(
  input: CreateDependencyInput
): Promise<Dependency> {
  // nanoid id + a single ISO createdAt — same identity convention as the other
  // repositories. No updatedAt: Dependency does not have one.
  const dependency: Dependency = {
    ...input,
    id: nanoid(),
    createdAt: new Date().toISOString(),
  };
  await db.dependencies.add(dependency);
  return dependency;
}

/**
 * Edges that BLOCK `entityId`: dependencies whose `toId` is this entity, i.e.
 * "what must complete before this entity can proceed." `toId` is indexed
 * (stores.ts: 'id, fromId, toId, type'), so this queries via the index.
 *
 * Cross-cutting getter — returns index order, unsorted (consistent with the
 * other byStatus/byScheduledDate getters; Dependency has no `order` field).
 */
export async function getDependenciesBlocking(
  entityId: ID
): Promise<Dependency[]> {
  return db.dependencies.where('toId').equals(entityId).toArray();
}

/**
 * Edges DOWNSTREAM of `entityId`: dependencies whose `fromId` is this entity,
 * i.e. "what this entity blocks." `fromId` is indexed, so this queries via the
 * index. Returns index order, unsorted (same rationale as above).
 */
export async function getDependenciesDownstreamOf(
  entityId: ID
): Promise<Dependency[]> {
  return db.dependencies.where('fromId').equals(entityId).toArray();
}

/**
 * All edges of one kind ('subgoal' or 'task'). This is the whole graph for that
 * kind: task ids and subgoal ids are disjoint namespaces, so each `type` is a
 * single self-contained graph that the engine (cycle detection / topological
 * sort) can operate on directly. `type` is indexed (stores.ts: 'id, fromId,
 * toId, type'), so this queries via the index.
 *
 * Cross-cutting getter — returns index order, unsorted (same convention as the
 * directional getters; Dependency has no `order` field).
 */
export async function getDependenciesByType(
  type: Dependency['type']
): Promise<Dependency[]> {
  return db.dependencies.where('type').equals(type).toArray();
}

export async function deleteDependency(id: ID): Promise<void> {
  // Plain delete. Dexie's table.delete() resolves without throwing when no row
  // matches the id, so this is naturally idempotent on an unknown id — no need
  // to pre-check existence. (Unlike update(), which returns a 0 count we throw
  // on; delete() has no such contract, so the convention stays consistent.)
  await db.dependencies.delete(id);
}

/**
 * Remove every dependency edge that references any of `entityIds` as EITHER
 * endpoint (fromId or toId). A dependency edge is relational metadata, not a
 * standalone record, so it must never outlive either of its endpoints; entity
 * deletes call this to keep the graph consistent.
 *
 * Designed to run INSIDE an existing rw transaction that already lists the
 * dependencies table (e.g. deleteGoal/deleteSubgoal/deleteTask): it issues plain
 * indexed operations that join whatever transaction is in scope, so the edge
 * cleanup commits atomically with the entity deletion. Two deletes rather than a
 * single `.or()` keeps it simple and obviously correct; an edge whose BOTH ends
 * are in the set is matched by the first delete and harmlessly missed by the
 * second. No-op on an empty array, and idempotent. Both fromId and toId are
 * indexed (stores.ts), so each delete hits the index.
 */
export async function deleteDependenciesReferencing(
  entityIds: ID[]
): Promise<void> {
  if (entityIds.length === 0) return;
  await db.dependencies.where('fromId').anyOf(entityIds).delete();
  await db.dependencies.where('toId').anyOf(entityIds).delete();
}
