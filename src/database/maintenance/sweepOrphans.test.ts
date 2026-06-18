import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/database/db';
import { createGoal } from '@/database/repositories/goalRepository';
import { createSubgoal } from '@/database/repositories/subgoalRepository';
import { createMilestone } from '@/database/repositories/milestoneRepository';
import { createTask } from '@/database/repositories/taskRepository';
import { sweepOrphans } from './sweepOrphans';
import type { CreateGoalInput } from '@/database/repositories/goalRepository';

function makeGoalInput(overrides: Partial<CreateGoalInput> = {}): CreateGoalInput {
  return {
    title: 'A goal',
    description: '',
    category: 'education',
    targetDate: '2027-09-01T00:00:00.000Z',
    status: 'active',
    priority: 'high',
    ...overrides,
  };
}

beforeEach(async () => {
  await Promise.all([
    db.goals.clear(),
    db.subgoals.clear(),
    db.milestones.clear(),
    db.tasks.clear(),
  ]);
});

describe('sweepOrphans', () => {
  it('a clean database has nothing to sweep', async () => {
    const goal = await createGoal(makeGoalInput());
    const sub = await createSubgoal({
      goalId: goal.id,
      title: 's',
      description: '',
      status: 'active',
      requiresConsistency: false,
      order: 0,
    });
    await createTask({
      subgoalId: sub.id,
      title: 't',
      status: 'pending',
      priority: 'medium',
      isRecurring: false,
      order: 0,
    });

    const result = await sweepOrphans();

    expect(result).toEqual({ subgoals: 0, milestones: 0, tasks: 0 });
    expect(await db.subgoals.count()).toBe(1);
    expect(await db.tasks.count()).toBe(1);
  });

  it('removes directly-orphaned subgoals, milestones, and tasks; keeps connected ones', async () => {
    const goal = await createGoal(makeGoalInput());
    const liveSub = await createSubgoal({
      goalId: goal.id,
      title: 'live',
      description: '',
      status: 'active',
      requiresConsistency: false,
      order: 0,
    });
    const liveTask = await createTask({
      subgoalId: liveSub.id,
      title: 'live task',
      status: 'pending',
      priority: 'medium',
      isRecurring: false,
      order: 0,
    });

    // Orphans: parents that never existed (simulate pre-fix stranded rows).
    const orphanSub = await createSubgoal({
      goalId: 'missing-goal',
      title: 'orphan sub',
      description: '',
      status: 'active',
      requiresConsistency: false,
      order: 0,
    });
    await createMilestone({
      subgoalId: 'missing-subgoal',
      title: 'orphan milestone',
      status: 'active',
      order: 0,
      aiSuggested: false,
    });
    await createTask({
      subgoalId: 'missing-subgoal',
      title: 'orphan task',
      status: 'pending',
      priority: 'medium',
      isRecurring: false,
      order: 0,
    });

    const result = await sweepOrphans();

    expect(result).toEqual({ subgoals: 1, milestones: 1, tasks: 1 });
    expect(await db.subgoals.get(orphanSub.id)).toBeUndefined();
    // Connected rows survive.
    expect(await db.subgoals.get(liveSub.id)).toBeDefined();
    expect(await db.tasks.get(liveTask.id)).toBeDefined();
  });

  it('transitively sweeps grandchildren of a goal deleted without cascade', async () => {
    // Reproduce a pre-fix orphan trail: full tree, then the goal row removed
    // directly (the old non-cascading delete), leaving subgoal+milestone+task.
    const goal = await createGoal(makeGoalInput());
    const sub = await createSubgoal({
      goalId: goal.id,
      title: 's',
      description: '',
      status: 'active',
      requiresConsistency: false,
      order: 0,
    });
    const milestone = await createMilestone({
      subgoalId: sub.id,
      title: 'm',
      status: 'active',
      order: 0,
      aiSuggested: false,
    });
    const task = await createTask({
      subgoalId: sub.id,
      title: 't',
      status: 'pending',
      priority: 'medium',
      isRecurring: false,
      order: 0,
    });

    await db.goals.delete(goal.id); // raw delete, no cascade

    const result = await sweepOrphans();

    // The subgoal is orphaned (goal gone); its milestone and task are swept too,
    // even though their own subgoal row still existed at sweep time.
    expect(result).toEqual({ subgoals: 1, milestones: 1, tasks: 1 });
    expect(await db.subgoals.get(sub.id)).toBeUndefined();
    expect(await db.milestones.get(milestone.id)).toBeUndefined();
    expect(await db.tasks.get(task.id)).toBeUndefined();
  });
});
