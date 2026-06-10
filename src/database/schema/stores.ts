/**
 * Dexie schema definitions for LifeMap.
 *
 * WHY this file exists:
 * Dexie describes a table's primary key and its indexes as a single string,
 * e.g. 'id, goalId, status'. The first field is the primary key; the rest are
 * indexed properties you can query/sort by efficiently. Keeping every one of
 * these strings here (instead of inline in db.ts) means the database's shape
 * lives in one declarative place — easy to read, easy to bump a version against.
 *
 * INDEXING PHILOSOPHY (beginner-relevant):
 * We only index what we will actually query by — foreign keys (to fetch
 * children of a parent) and the few fields the dashboard genuinely filters on
 * (task status, scheduledDate). We are NOT indexing every column. Extra indexes
 * cost write performance and add no value while datasets are tiny. More indexes
 * can be added later in a new DB_VERSION if a real query needs them.
 */

export const DB_NAME = 'lifemap';

// Bump this number whenever STORES changes shape; Dexie runs migrations per version.
export const DB_VERSION = 1;

// Record<string, string> (not `as const`) so it slots cleanly into Dexie's
// stores() parameter type, which expects a mutable string map.
export const STORES: Record<string, string> = {
  // Goals are queried by status (active list) and sorted by recency.
  goals: 'id, status, updatedAt',

  // Subgoals are always fetched as children of a goal.
  subgoals: 'id, goalId',

  // Milestones are always fetched as children of a subgoal.
  milestones: 'id, subgoalId',

  // Tasks: by parent (subgoal/milestone), by status, and by scheduledDate
  // (the Today dashboard will range-query scheduledDate for daily tasks).
  tasks: 'id, subgoalId, milestoneId, status, scheduledDate',

  // Dependencies are traversed in both directions (what blocks what).
  dependencies: 'id, fromId, toId, type',

  // Single profile row, looked up by id only.
  profile: 'id',

  // Snapshots: per-goal history, ordered by capture time.
  snapshots: 'id, goalId, capturedAt',
};