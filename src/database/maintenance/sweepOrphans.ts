/**
 * sweepOrphans — one-time cleanup of rows orphaned BEFORE the cascade-delete fix.
 *
 * WHY this exists: deleteGoal/deleteSubgoal/deleteMilestone used to delete only
 * their own row, so deleting a goal (or subgoal/milestone) left its descendants
 * stranded in IndexedDB forever. The cascade fix stops NEW orphans, but cannot
 * retroactively remove rows already orphaned. This sweep does that one cleanup.
 *
 * WHY it lives in database/maintenance (and may import db): it is a data-layer
 * tool, peer to the repositories — the db-access boundary it respects is the one
 * that keeps the engine/store/UI away from Dexie, not other database/ modules.
 * It is a plain callable function, NOT wired into any UI.
 *
 * ORPHAN definition (structural / tree-reachability, transitive):
 *   - subgoal  -> orphaned if its goal no longer exists
 *   - milestone-> orphaned if its subgoal is not LIVE (gone, or itself orphaned)
 *   - task     -> orphaned if its subgoal is not LIVE
 * "Live subgoal" = a subgoal whose goal still exists. Keying milestones/tasks off
 * the LIVE subgoal set (not merely "subgoal row exists") makes the sweep
 * transitive in one pass: a goal deleted long ago leaves an orphan subgoal whose
 * own tasks/milestones are swept too.
 *
 * NOT swept: a task whose subgoal exists but whose optional milestoneId points at
 * a deleted milestone. That task still belongs to a valid subgoal (it is not
 * tree-disconnected), so deleting it would lose real data. The cascade fix
 * prevents new ones; re-homing such tasks (clearing milestoneId) is a separate
 * concern, noted in the handoff.
 *
 * HOW TO INVOKE (not auto-run): import and call once, e.g. from a browser console
 * shim or a throwaway dev button:
 *     import { sweepOrphans } from '@/database/maintenance/sweepOrphans'
 *     sweepOrphans().then(console.log)  // -> { subgoals, milestones, tasks }
 */

import { db } from '@/database/db';

export interface OrphanSweepResult {
  subgoals: number;
  milestones: number;
  tasks: number;
}

export async function sweepOrphans(): Promise<OrphanSweepResult> {
  return db.transaction(
    'rw',
    db.goals,
    db.subgoals,
    db.milestones,
    db.tasks,
    async () => {
      // Tiny tables: load and reason in memory (same convention as the repos'
      // unindexed filters), then bulk-delete by id.
      const goalIds = new Set(await db.goals.toCollection().primaryKeys());
      const subgoals = await db.subgoals.toArray();

      // A subgoal is live only if its goal still exists.
      const liveSubgoalIds = new Set(
        subgoals.filter((s) => goalIds.has(s.goalId)).map((s) => s.id),
      );

      const orphanSubgoalIds = subgoals
        .filter((s) => !goalIds.has(s.goalId))
        .map((s) => s.id);

      const milestones = await db.milestones.toArray();
      const orphanMilestoneIds = milestones
        .filter((m) => !liveSubgoalIds.has(m.subgoalId))
        .map((m) => m.id);

      const tasks = await db.tasks.toArray();
      const orphanTaskIds = tasks
        .filter((t) => !liveSubgoalIds.has(t.subgoalId))
        .map((t) => t.id);

      await db.subgoals.bulkDelete(orphanSubgoalIds);
      await db.milestones.bulkDelete(orphanMilestoneIds);
      await db.tasks.bulkDelete(orphanTaskIds);

      return {
        subgoals: orphanSubgoalIds.length,
        milestones: orphanMilestoneIds.length,
        tasks: orphanTaskIds.length,
      };
    },
  );
}
