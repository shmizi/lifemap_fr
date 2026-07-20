// database/migration/importToSupabase.ts — the one-time Dexie → Postgres seed
// (ADR-0003 step 3). On first sign-in, copies the user's existing LOCAL data into
// their Supabase account so nothing is stranded when the repository port later flips
// the live read/write path to Postgres.
//
// This is a database-layer migration tool, so it is allowed to read `db` directly
// (the same layer as repositories/); it writes through the Supabase client. It runs
// ONLY when Supabase is configured AND the user is signed in, and it self-guards so
// it seeds at most once per account.
//
// IMPORTANT (scope): while Dexie stays the live path, this is a one-time SEED — local
// edits made AFTER the import will not reach Postgres until the repository port lands.
// That staleness window is the accepted tradeoff of "keep Dexie live" for this step.

import { db } from '@/database/db'
import { supabase, isSupabaseConfigured } from '@/services/supabase/client'
import {
  goalToRow,
  subgoalToRow,
  milestoneToRow,
  taskToRow,
  dependencyToRow,
  userProfileToRow,
  userContextToRow,
  goalContextToRow,
  snapshotToRow,
  opportunityToRow,
} from '@/database/migration/toRows'

export type ImportStatus =
  | 'unconfigured' // no Supabase in this build
  | 'signed_out' // configured, but nobody is signed in
  | 'already' // this account was already seeded — nothing to do
  | 'imported' // rows were copied up this run
  | 'error' // a write failed; safe to retry next sign-in (flag not set)

export interface ImportResult {
  status: ImportStatus
  counts?: Record<string, number>
  error?: string
}

// Per-account localStorage guard so the (cheap but non-zero) pre-flight query runs
// only once, not on every sign-in.
const seededKey = (userId: string) => `lifemap.dexieImported.${userId}`

export async function importLocalDataToSupabase(): Promise<ImportResult> {
  if (!isSupabaseConfigured || !supabase) return { status: 'unconfigured' }

  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  if (!userId) return { status: 'signed_out' }

  if (localStorage.getItem(seededKey(userId))) return { status: 'already' }

  // Safety net beyond the localStorage flag: if the account already holds goals,
  // treat it as seeded and never double-write (e.g. after a cache clear on a device
  // that already imported). RLS scopes this count to the signed-in user.
  const { count, error: countError } = await supabase
    .from('goals')
    .select('id', { count: 'exact', head: true })
  if (countError) return { status: 'error', error: countError.message }
  if ((count ?? 0) > 0) {
    localStorage.setItem(seededKey(userId), '1')
    return { status: 'already' }
  }

  // Read every local table up front.
  const [
    goals,
    subgoals,
    milestones,
    tasks,
    dependencies,
    profiles,
    userContexts,
    goalContexts,
    snapshots,
    opportunities,
  ] = await Promise.all([
    db.goals.toArray(),
    db.subgoals.toArray(),
    db.milestones.toArray(),
    db.tasks.toArray(),
    db.dependencies.toArray(),
    db.profile.toArray(),
    db.userContext.toArray(),
    db.goalContext.toArray(),
    db.snapshots.toArray(),
    db.opportunities.toArray(),
  ])

  // Upsert a batch (idempotent on its conflict key), returning how many rows landed.
  // Throws on error so the orchestration below can abort and report a clean retry.
  const push = async (
    table: string,
    rows: object[],
    onConflict: string,
  ): Promise<number> => {
    if (rows.length === 0) return 0
    const { error } = await supabase!.from(table).upsert(rows, { onConflict })
    if (error) throw new Error(`${table}: ${error.message}`)
    return rows.length
  }

  try {
    const counts: Record<string, number> = {}
    // Parents before children so the FK cascade constraints are satisfied:
    // goals → subgoals → milestones → tasks, then the goal-scoped side tables.
    counts.goals = await push('goals', goals.map(goalToRow), 'id')
    counts.subgoals = await push('subgoals', subgoals.map(subgoalToRow), 'id')
    counts.milestones = await push('milestones', milestones.map(milestoneToRow), 'id')
    counts.tasks = await push('tasks', tasks.map(taskToRow), 'id')
    counts.goal_context = await push(
      'goal_context',
      goalContexts.map(goalContextToRow),
      'goal_id',
    )
    counts.snapshots = await push('snapshots', snapshots.map(snapshotToRow), 'id')
    counts.dependencies = await push(
      'dependencies',
      dependencies.map(dependencyToRow),
      'id',
    )
    counts.opportunities = await push(
      'opportunities',
      opportunities.map(opportunityToRow),
      'id',
    )
    // Single-row-per-user tables (at most one local row each), keyed on user_id.
    counts.user_profiles = await push(
      'user_profiles',
      profiles.slice(0, 1).map(userProfileToRow),
      'user_id',
    )
    counts.user_context = await push(
      'user_context',
      userContexts.slice(0, 1).map(userContextToRow),
      'user_id',
    )

    localStorage.setItem(seededKey(userId), '1')
    return { status: 'imported', counts }
  } catch (err) {
    // Leave the guard UNSET so the next sign-in retries. Dexie is still the source
    // of truth, so a partial seed loses no user data.
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'import failed',
    }
  }
}
