/**
 * Hierarchy repository — assembles read-only tree view-models from the
 * individual entity repositories.
 *
 * WHY this lives at the repository layer (and NOT in the UI):
 * The Goal Detail View needs the whole Goal -> Subgoal -> Milestone -> Task
 * nesting as a single typed object. If a component assembled it, the component
 * would fan out into many separate getter calls and re-implement the
 * parent/child + milestone/loose-task partitioning itself — exactly the
 * "business logic inside UI" the data-flow rule forbids
 * (DB -> Repositories -> Engine -> Store -> UI). Composing it here keeps the UI
 * dumb: it receives one GoalTree and just renders it.
 *
 * This file adds NO new database queries and NO new indexes. It only composes
 * the existing, already-tested by-parent getters.
 */

import type {
  ID,
  Task,
  GoalTree,
  SubgoalTree,
  MilestoneTree,
  TaskLineage,
} from '@/core/types';
import { getGoalById } from './goalRepository';
import { getSubgoalById, getSubgoalsByGoalId } from './subgoalRepository';
import { getMilestonesBySubgoalId } from './milestoneRepository';
import { getTasksBySubgoalId } from './taskRepository';

export async function getGoalTree(goalId: ID): Promise<GoalTree | undefined> {
  const goal = await getGoalById(goalId);
  if (!goal) return undefined; // unknown goal -> caller decides what a miss means

  const subgoals = await getSubgoalsByGoalId(goalId);

  // Subgoals are independent of one another, so build each subtree in parallel.
  // Promise.all preserves input order, and getSubgoalsByGoalId already returned
  // them sorted by `order`, so the result array is already ordered.
  const subgoalTrees: SubgoalTree[] = await Promise.all(
    subgoals.map(async (subgoal): Promise<SubgoalTree> => {
      // One fetch of milestones and one of ALL this subgoal's tasks, in
      // parallel. We deliberately do NOT call getTasksByMilestoneId per
      // milestone — that would be N extra queries and would also miss the
      // loose (milestone-less) tasks. One getTasksBySubgoalId covers both.
      const [milestones, tasks] = await Promise.all([
        getMilestonesBySubgoalId(subgoal.id),
        getTasksBySubgoalId(subgoal.id),
      ]);

      // Partition the subgoal's tasks once:
      //   - milestoneId set      -> grouped under that milestone
      //   - milestoneId undefined -> "loose", hanging directly off the subgoal
      const tasksByMilestone = new Map<ID, Task[]>();
      const looseTasks: Task[] = [];
      for (const task of tasks) {
        if (task.milestoneId === undefined) {
          looseTasks.push(task);
        } else {
          const bucket = tasksByMilestone.get(task.milestoneId);
          if (bucket) bucket.push(task);
          else tasksByMilestone.set(task.milestoneId, [task]);
        }
      }

      // Every milestone of the subgoal becomes a MilestoneTree — including one
      // with zero tasks (its `tasks` is simply []). getTasksBySubgoalId already
      // returned tasks in `order`, so each bucket is pre-sorted; we sort again
      // so this function's ordering guarantee stands on its own.
      const milestoneTrees: MilestoneTree[] = milestones
        .map((milestone): MilestoneTree => {
          const milestoneTasks = tasksByMilestone.get(milestone.id) ?? [];
          milestoneTasks.sort((a, b) => a.order - b.order);
          return { milestone, tasks: milestoneTasks };
        })
        .sort((a, b) => a.milestone.order - b.milestone.order);

      looseTasks.sort((a, b) => a.order - b.order);

      return { subgoal, milestones: milestoneTrees, looseTasks };
    })
  );

  // Defensive re-sort: don't let the assembled tree's ordering depend on a
  // getter's internal implementation continuing to sort for us.
  subgoalTrees.sort((a, b) => a.subgoal.order - b.subgoal.order);

  return { goal, subgoals: subgoalTrees };
}

/**
 * Resolve the subgoal -> goal lineage for a set of tasks, keyed by subgoalId.
 *
 * WHY this lives here: the dashboard answers "why does this task matter" by
 * showing each scheduled task's "Subgoal · Goal" context. That join (task ->
 * subgoal -> goal) is exactly the parent-walking the data-flow rule keeps out of
 * the UI, so we compose it once here from existing getters — no new queries, no
 * new indexes, same as getGoalTree.
 *
 * Keyed by subgoalId (not task id) because every task under one subgoal shares
 * the same lineage; deduping to unique subgoals means one subgoal+goal lookup
 * per subgoal regardless of how many tasks point at it. A task whose subgoal or
 * goal no longer exists (a dangling row) is simply absent from the result, so
 * the caller renders no lineage for it rather than crashing.
 */
export async function getTaskLineages(
  tasks: Task[],
): Promise<Record<ID, TaskLineage>> {
  const subgoalIds = [...new Set(tasks.map((task) => task.subgoalId))];

  const entries = await Promise.all(
    subgoalIds.map(async (subgoalId): Promise<[ID, TaskLineage] | null> => {
      const subgoal = await getSubgoalById(subgoalId);
      if (!subgoal) return null; // dangling task -> no lineage
      const goal = await getGoalById(subgoal.goalId);
      if (!goal) return null;
      return [
        subgoalId,
        { subgoalTitle: subgoal.title, goalTitle: goal.title },
      ];
    }),
  );

  const lineages: Record<ID, TaskLineage> = {};
  for (const entry of entries) {
    if (entry) lineages[entry[0]] = entry[1];
  }
  return lineages;
}
