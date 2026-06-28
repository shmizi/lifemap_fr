/**
 * The single Dexie database instance for LifeMap.
 *
 * WHY this file exists:
 * This is the ONLY module that constructs the database connection. Everything
 * else (repositories) imports the `db` export from here. Dexie opens the
 * connection lazily on the first read/write, so simply importing this file does
 * not block app startup.
 *
 * ARCHITECTURAL BOUNDARY:
 * Only files in database/repositories/ are allowed to import this. The engine,
 * stores, and UI must never touch `db` directly — that boundary is what keeps
 * storage swappable and the data-flow rule (DB -> Repositories -> Engine ->
 * Store -> UI) intact.
 */

import Dexie, { type Table } from 'dexie';
import type {
  Goal,
  Subgoal,
  Milestone,
  Task,
  Dependency,
  UserProfile,
  ProgressSnapshot,
  Opportunity,
  UserContext,
  GoalContext,
} from '@/core/types';
import { DB_NAME, DB_VERSION, STORES } from '@/database/schema/stores';

export class LifeMapDB extends Dexie {
  // Dexie populates these table handles at runtime by matching each property
  // name to a key in STORES. The `!` tells TypeScript "Dexie assigns this, trust
  // me" — the property names below MUST match the keys in STORES exactly.
  // Table<T, KeyType>: T is the row shape, KeyType is the primary-key type (id: string).
  goals!: Table<Goal, string>;
  subgoals!: Table<Subgoal, string>;
  milestones!: Table<Milestone, string>;
  tasks!: Table<Task, string>;
  dependencies!: Table<Dependency, string>;
  profile!: Table<UserProfile, string>;
  snapshots!: Table<ProgressSnapshot, string>;
  opportunities!: Table<Opportunity, string>;
  // Phase 9 — AI personalization context. userContext keyed by its fixed single
  // id; goalContext keyed by goalId (one row per goal).
  userContext!: Table<UserContext, string>;
  goalContext!: Table<GoalContext, string>;

  constructor() {
    super(DB_NAME);
    this.version(DB_VERSION).stores(STORES);
  }
}

// Exported singleton — import this everywhere a repository needs the database.
export const db = new LifeMapDB();