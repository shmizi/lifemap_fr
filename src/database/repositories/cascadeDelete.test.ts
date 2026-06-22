import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { createGoal, deleteGoal, type CreateGoalInput } from './goalRepository';
import { createSubgoal, deleteSubgoal } from './subgoalRepository';
import { createMilestone, deleteMilestone } from './milestoneRepository';
import { createTask } from './taskRepository';
import type { Subgoal, Milestone, Task } from '@/core/types';

// Factories mirror hierarchyRepository.test.ts — seed real rows through the real
// create functions so the cascade is exercised against true persisted data.
function makeGoalInput(overrides: Partial<CreateGoalInput> = {}): CreateGoalInput {
  return {
    title: 'Get into RWTH Aachen',
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
  overrides: Partial<Omit<Subgoal, 'id' | 'createdAt' | 'updatedAt'>> = {},
): Omit<Subgoal, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    goalId,
    title: 'German B2',
    description: '',
    status: 'active',
    requiresConsistency: false,
    order: 0,
    ...overrides,
  };
}

function makeMilestoneInput(
  subgoalId: string,
  overrides: Partial<Omit<Milestone, 'id' | 'createdAt'>> = {},
): Omit<Milestone, 'id' | 'createdAt'> {
  return {
    subgoalId,
    title: 'Milestone',
    status: 'active',
    order: 0,
    aiSuggested: false,
    ...overrides,
  };
}

function makeTaskInput(
  subgoalId: string,
  overrides: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>> = {},
): Omit<Task, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    subgoalId,
    title: 'Task',
    status: 'pending',
    priority: 'medium',
    isRecurring: false,
    order: 0,
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

describe('deleteGoal (cascade)', () => {
  it('removes the goal and every subgoal, milestone, and task beneath it', async () => {
    const goal = await createGoal(makeGoalInput());
    const sub = await createSubgoal(makeSubgoalInput(goal.id));
    const milestone = await createMilestone(makeMilestoneInput(sub.id));
    await createTask(makeTaskInput(sub.id, { milestoneId: milestone.id })); // grouped
    await createTask(makeTaskInput(sub.id)); // loose

    await deleteGoal(goal.id);

    expect(await db.goals.get(goal.id)).toBeUndefined();
    expect(await db.subgoals.where('goalId').equals(goal.id).count()).toBe(0);
    expect(await db.milestones.where('subgoalId').equals(sub.id).count()).toBe(0);
    expect(await db.tasks.where('subgoalId').equals(sub.id).count()).toBe(0);
  });

  it('leaves a sibling goal and its subtree untouched', async () => {
    const goal = await createGoal(makeGoalInput({ title: 'doomed' }));
    const sub = await createSubgoal(makeSubgoalInput(goal.id));
    await createTask(makeTaskInput(sub.id));

    const other = await createGoal(makeGoalInput({ title: 'keep' }));
    const otherSub = await createSubgoal(makeSubgoalInput(other.id));
    const otherMilestone = await createMilestone(makeMilestoneInput(otherSub.id));
    const otherTask = await createTask(makeTaskInput(otherSub.id));

    await deleteGoal(goal.id);

    expect(await db.goals.get(other.id)).toBeDefined();
    expect(await db.subgoals.get(otherSub.id)).toBeDefined();
    expect(await db.milestones.get(otherMilestone.id)).toBeDefined();
    expect(await db.tasks.get(otherTask.id)).toBeDefined();
  });
});

describe('deleteSubgoal (cascade)', () => {
  it('removes the subgoal with its milestones and tasks, sparing siblings', async () => {
    const goal = await createGoal(makeGoalInput());
    const sub = await createSubgoal(makeSubgoalInput(goal.id, { order: 0 }));
    const milestone = await createMilestone(makeMilestoneInput(sub.id));
    await createTask(makeTaskInput(sub.id, { milestoneId: milestone.id }));
    await createTask(makeTaskInput(sub.id)); // loose

    // A sibling subgoal under the same goal must survive.
    const sibling = await createSubgoal(makeSubgoalInput(goal.id, { order: 1 }));
    const siblingTask = await createTask(makeTaskInput(sibling.id));

    await deleteSubgoal(sub.id);

    expect(await db.subgoals.get(sub.id)).toBeUndefined();
    expect(await db.milestones.where('subgoalId').equals(sub.id).count()).toBe(0);
    expect(await db.tasks.where('subgoalId').equals(sub.id).count()).toBe(0);

    expect(await db.subgoals.get(sibling.id)).toBeDefined();
    expect(await db.tasks.get(siblingTask.id)).toBeDefined();
    expect(await db.goals.get(goal.id)).toBeDefined();
  });
});

describe('deleteMilestone (rehome, not destroy)', () => {
  it('rehomes its tasks to the subgoal as loose tasks, deletes only the milestone', async () => {
    const goal = await createGoal(makeGoalInput());
    const sub = await createSubgoal(makeSubgoalInput(goal.id));
    const milestone = await createMilestone(makeMilestoneInput(sub.id, { order: 0 }));
    const otherMilestone = await createMilestone(
      makeMilestoneInput(sub.id, { order: 1 }),
    );

    // One pre-existing loose task (order 0) so we can check the rehomed tasks
    // append AFTER it without colliding.
    const looseTask = await createTask(makeTaskInput(sub.id, { order: 0 }));
    // Milestone tasks carry their own per-milestone order (0, 1).
    const taskA = await createTask(
      makeTaskInput(sub.id, { milestoneId: milestone.id, order: 0 }),
    );
    const taskB = await createTask(
      makeTaskInput(sub.id, { milestoneId: milestone.id, order: 1 }),
    );
    const otherTask = await createTask(
      makeTaskInput(sub.id, { milestoneId: otherMilestone.id, order: 0 }),
    );

    await deleteMilestone(milestone.id);

    // Milestone row gone; its tasks NOT deleted.
    expect(await db.milestones.get(milestone.id)).toBeUndefined();
    const a = await db.tasks.get(taskA.id);
    const b = await db.tasks.get(taskB.id);
    expect(a).toBeDefined();
    expect(b).toBeDefined();

    // milestoneId cleared (and removed from the index); subgoalId unchanged.
    expect(a!.milestoneId).toBeUndefined();
    expect(b!.milestoneId).toBeUndefined();
    expect(a!.subgoalId).toBe(sub.id);
    expect(b!.subgoalId).toBe(sub.id);
    expect(await db.tasks.where('milestoneId').equals(milestone.id).count()).toBe(0);

    // Rehomed orders append after the existing loose max (0) -> 1, 2; no collision
    // with looseTask (still 0), and they keep their relative A-before-B order.
    const looseOrders = [a!.order, b!.order, (await db.tasks.get(looseTask.id))!.order];
    expect(new Set(looseOrders).size).toBe(3); // all distinct
    expect(a!.order).toBe(1);
    expect(b!.order).toBe(2);

    // The other milestone and its task are untouched; subgoal survives.
    expect(await db.milestones.get(otherMilestone.id)).toBeDefined();
    const other = await db.tasks.get(otherTask.id);
    expect(other!.milestoneId).toBe(otherMilestone.id);
    expect(await db.subgoals.get(sub.id)).toBeDefined();
  });
});
