import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/database/db';
import { createGoal } from '@/database/repositories/goalRepository';
import { createSubgoal } from '@/database/repositories/subgoalRepository';
import { createMilestone } from '@/database/repositories/milestoneRepository';
import { createTask } from '@/database/repositories/taskRepository';
import { rehomeDanglingTasks } from './rehomeDanglingTasks';
import type { CreateGoalInput } from '@/database/repositories/goalRepository';
import type { Subgoal } from '@/core/types';

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

function makeSubgoalInput(
  goalId: string,
): Omit<Subgoal, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    goalId,
    title: 'Subgoal',
    description: '',
    status: 'active',
    requiresConsistency: false,
    order: 0,
  };
}

async function makeRealSubgoal() {
  const goal = await createGoal(makeGoalInput());
  return createSubgoal(makeSubgoalInput(goal.id));
}

beforeEach(async () => {
  await Promise.all([
    db.goals.clear(),
    db.subgoals.clear(),
    db.milestones.clear(),
    db.tasks.clear(),
  ]);
});

describe('rehomeDanglingTasks', () => {
  it('does nothing when no task has a dangling milestoneId', async () => {
    const sub = await makeRealSubgoal();
    const milestone = await createMilestone({
      subgoalId: sub.id,
      title: 'm',
      status: 'active',
      order: 0,
      aiSuggested: false,
    });
    await createTask({
      subgoalId: sub.id,
      title: 'grouped',
      status: 'pending',
      priority: 'medium',
      isRecurring: false,
      order: 0,
      milestoneId: milestone.id, // valid milestone -> not dangling
    });
    await createTask({
      subgoalId: sub.id,
      title: 'loose',
      status: 'pending',
      priority: 'medium',
      isRecurring: false,
      order: 0, // already loose -> not dangling
    });

    expect(await rehomeDanglingTasks()).toEqual({ rehomed: 0 });
  });

  it('rehomes a ghost task (dead milestone, valid subgoal) to loose, clearing milestoneId', async () => {
    const sub = await makeRealSubgoal();
    const ghost = await createTask({
      subgoalId: sub.id,
      title: 'ghost',
      status: 'pending',
      priority: 'medium',
      isRecurring: false,
      order: 0,
      milestoneId: 'milestone-that-was-deleted',
    });

    const result = await rehomeDanglingTasks();

    expect(result).toEqual({ rehomed: 1 });
    const after = await db.tasks.get(ghost.id);
    expect(after).toBeDefined();
    expect(after!.milestoneId).toBeUndefined();
    expect(after!.subgoalId).toBe(sub.id); // subgoal untouched
  });

  it('appends rehomed tasks after the existing loose-order sequence, no collisions', async () => {
    const sub = await makeRealSubgoal();
    // An existing loose task at order 0.
    const loose = await createTask({
      subgoalId: sub.id,
      title: 'loose',
      status: 'pending',
      priority: 'medium',
      isRecurring: false,
      order: 0,
    });
    // Two ghosts carrying their old per-milestone orders (0, 1).
    const ghostA = await createTask({
      subgoalId: sub.id,
      title: 'ghostA',
      status: 'pending',
      priority: 'medium',
      isRecurring: false,
      order: 0,
      milestoneId: 'dead',
    });
    const ghostB = await createTask({
      subgoalId: sub.id,
      title: 'ghostB',
      status: 'pending',
      priority: 'medium',
      isRecurring: false,
      order: 1,
      milestoneId: 'dead',
    });

    expect(await rehomeDanglingTasks()).toEqual({ rehomed: 2 });

    const a = await db.tasks.get(ghostA.id);
    const b = await db.tasks.get(ghostB.id);
    const l = await db.tasks.get(loose.id);

    // Appended after loose max (0) -> 1, 2; relative A-before-B preserved.
    expect(a!.order).toBe(1);
    expect(b!.order).toBe(2);
    expect(l!.order).toBe(0); // untouched
    expect(new Set([a!.order, b!.order, l!.order]).size).toBe(3); // distinct
  });

  it('leaves a fully-orphaned task (subgoal also missing) for sweepOrphans', async () => {
    const stranded = await createTask({
      subgoalId: 'missing-subgoal',
      title: 'stranded',
      status: 'pending',
      priority: 'medium',
      isRecurring: false,
      order: 0,
      milestoneId: 'dead',
    });

    expect(await rehomeDanglingTasks()).toEqual({ rehomed: 0 });
    // Untouched — its subgoal is gone, so it is sweepOrphans' responsibility.
    const after = await db.tasks.get(stranded.id);
    expect(after!.milestoneId).toBe('dead');
  });
});
