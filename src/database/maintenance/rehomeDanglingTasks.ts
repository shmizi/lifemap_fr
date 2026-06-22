/**
 * rehomeDanglingTasks — one-time cleanup of "ghost" tasks left by the OLD
 * (pre-rehome) deleteMilestone, which deleted only the milestone row.
 *
 * WHY this exists: before milestone deletion rehomed its tasks, deleting a
 * milestone left its tasks with a milestoneId pointing at a milestone that no
 * longer exists. Such a task still has a valid subgoal, so it is NOT orphaned
 * (sweepOrphans leaves it alone) — but the goal tree only renders tasks whose
 * milestoneId matches a real milestone or is absent, so these tasks are
 * INVISIBLE in the tree while still counting toward progress/priority/review.
 * This sweep rehomes them: clear milestoneId so they become loose tasks under
 * their subgoal (the "Other tasks" section), exactly like the live deleteMilestone
 * path does now.
 *
 * RELATION to sweepOrphans: complementary, non-overlapping. sweepOrphans deletes
 * tasks whose SUBGOAL is gone (truly disconnected). This rehomes tasks whose
 * subgoal is fine but whose MILESTONE is gone. A task with both gone is handled
 * by sweepOrphans (subgoal missing), not here.
 *
 * WHY it may import db: same as sweepOrphans — a data-layer maintenance tool,
 * peer to the repositories. Plain callable function, NOT wired into any UI.
 *
 * `order` is scoped per (subgoal, milestone-group); rehomed tasks are appended to
 * the END of their subgoal's existing loose-task order sequence (per subgoal) so
 * they never collide with tasks already loose there.
 *
 * HOW TO INVOKE (not auto-run): import and call once, e.g. from a browser console
 * shim or a throwaway dev trigger:
 *     import { rehomeDanglingTasks } from '@/database/maintenance/rehomeDanglingTasks'
 *     rehomeDanglingTasks().then(console.log)  // -> { rehomed: <count> }
 */

import { db } from '@/database/db';
import type { ID } from '@/core/types';

export interface RehomeResult {
  rehomed: number;
}

export async function rehomeDanglingTasks(): Promise<RehomeResult> {
  return db.transaction('rw', db.subgoals, db.milestones, db.tasks, async () => {
    const milestoneIds = new Set(await db.milestones.toCollection().primaryKeys());
    const subgoalIds = new Set(await db.subgoals.toCollection().primaryKeys());
    const tasks = await db.tasks.toArray();

    // Ghost tasks: a milestoneId that no longer exists, but a still-valid subgoal.
    const dangling = tasks.filter(
      (t) =>
        t.milestoneId !== undefined &&
        !milestoneIds.has(t.milestoneId) &&
        subgoalIds.has(t.subgoalId),
    );
    if (dangling.length === 0) return { rehomed: 0 };

    // Per subgoal, the highest order already used by its loose tasks. Rehomed
    // tasks append after it. (Computed from the CURRENT loose tasks — the ghost
    // tasks are not loose yet, so they don't skew this.)
    const looseMaxBySubgoal = new Map<ID, number>();
    for (const t of tasks) {
      if (t.milestoneId === undefined) {
        const cur = looseMaxBySubgoal.get(t.subgoalId);
        looseMaxBySubgoal.set(
          t.subgoalId,
          cur === undefined ? t.order : Math.max(cur, t.order),
        );
      }
    }

    // Group ghosts by subgoal, then append each group in its current order so the
    // relative sequence is preserved as they join the loose group.
    const bySubgoal = new Map<ID, typeof dangling>();
    for (const t of dangling) {
      const group = bySubgoal.get(t.subgoalId) ?? [];
      group.push(t);
      bySubgoal.set(t.subgoalId, group);
    }

    const now = new Date().toISOString();
    for (const [subgoalId, group] of bySubgoal) {
      group.sort((a, b) => a.order - b.order);
      let nextOrder = (looseMaxBySubgoal.get(subgoalId) ?? -1) + 1;
      for (const t of group) {
        await db.tasks.update(t.id, {
          milestoneId: undefined,
          order: nextOrder,
          updatedAt: now,
        });
        nextOrder += 1;
      }
    }

    return { rehomed: dangling.length };
  });
}
