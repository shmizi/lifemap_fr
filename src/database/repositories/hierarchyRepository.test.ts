import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/database/db';
import {
  getGoalTree,
  getTaskLineages,
  getTasksByGoalId,
} from './hierarchyRepository';
import { createGoal, type CreateGoalInput } from './goalRepository';
import { createSubgoal } from './subgoalRepository';
import { createMilestone } from './milestoneRepository';
import { createTask } from './taskRepository';
import type { Subgoal, Milestone, Task } from '@/core/types';

// ── Factories ────────────────────────────────────────────────────────────────
// Minimal-but-valid create inputs; tests override only the fields they care
// about. getGoalTree composes other repositories, so we seed real rows through
// their real create functions rather than hand-building objects.

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
  overrides: Partial<Omit<Subgoal, 'id' | 'createdAt' | 'updatedAt'>> = {}
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
  overrides: Partial<Omit<Milestone, 'id' | 'createdAt'>> = {}
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
  overrides: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>> = {}
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
  // Isolate every test — these stores are shared across the whole suite.
  await Promise.all([
    db.goals.clear(),
    db.subgoals.clear(),
    db.milestones.clear(),
    db.tasks.clear(),
  ]);
});

describe('hierarchyRepository.getGoalTree', () => {
  it('assembles a full tree: subgoal with milestones+tasks, and a milestone-less subgoal with loose tasks', async () => {
    const goal = await createGoal(makeGoalInput());

    // Subgoal A (order 0): two milestones, each with one task.
    const subA = await createSubgoal(makeSubgoalInput(goal.id, { title: 'A', order: 0 }));
    // Insert milestones out of order to prove the tree sorts by milestone.order.
    const mB = await createMilestone(makeMilestoneInput(subA.id, { title: 'mB', order: 1 }));
    const mA = await createMilestone(makeMilestoneInput(subA.id, { title: 'mA', order: 0 }));
    await createTask(makeTaskInput(subA.id, { title: 'tA', milestoneId: mA.id, order: 0 }));
    await createTask(makeTaskInput(subA.id, { title: 'tB', milestoneId: mB.id, order: 0 }));

    // Subgoal B (order 1): no milestones, two loose tasks (inserted out of order).
    const subB = await createSubgoal(makeSubgoalInput(goal.id, { title: 'B', order: 1 }));
    await createTask(makeTaskInput(subB.id, { title: 'loose2', order: 2 }));
    await createTask(makeTaskInput(subB.id, { title: 'loose1', order: 1 }));

    const tree = await getGoalTree(goal.id);

    expect(tree).toBeDefined();
    expect(tree!.goal.id).toBe(goal.id);
    expect(tree!.subgoals).toHaveLength(2);

    // Subgoals sorted by order: A then B.
    const [treeA, treeB] = tree!.subgoals;
    expect(treeA.subgoal.title).toBe('A');
    expect(treeB.subgoal.title).toBe('B');

    // A: milestones sorted by milestone.order -> mA (0) before mB (1).
    expect(treeA.milestones.map((m) => m.milestone.title)).toEqual(['mA', 'mB']);
    expect(treeA.milestones[0].tasks.map((t) => t.title)).toEqual(['tA']);
    expect(treeA.milestones[1].tasks.map((t) => t.title)).toEqual(['tB']);
    expect(treeA.looseTasks).toEqual([]);

    // B: no milestones, loose tasks sorted by order.
    expect(treeB.milestones).toEqual([]);
    expect(treeB.looseTasks.map((t) => t.title)).toEqual(['loose1', 'loose2']);
  });

  it('subgoal with no milestones and no tasks yields empty milestones and empty looseTasks', async () => {
    const goal = await createGoal(makeGoalInput());
    await createSubgoal(makeSubgoalInput(goal.id, { title: 'empty', order: 0 }));

    const tree = await getGoalTree(goal.id);

    expect(tree!.subgoals).toHaveLength(1);
    expect(tree!.subgoals[0].milestones).toEqual([]);
    expect(tree!.subgoals[0].looseTasks).toEqual([]);
  });

  it('a task with no milestoneId lands in looseTasks, never under a milestone', async () => {
    const goal = await createGoal(makeGoalInput());
    const sub = await createSubgoal(makeSubgoalInput(goal.id, { order: 0 }));
    const milestone = await createMilestone(makeMilestoneInput(sub.id, { order: 0 }));
    // Task explicitly has NO milestoneId.
    await createTask(makeTaskInput(sub.id, { title: 'orphan', order: 0 }));

    const tree = await getGoalTree(goal.id);
    const subTree = tree!.subgoals[0];

    // The milestone exists in the tree but holds no tasks...
    expect(subTree.milestones).toHaveLength(1);
    expect(subTree.milestones[0].milestone.id).toBe(milestone.id);
    expect(subTree.milestones[0].tasks).toEqual([]);
    // ...and the orphan task is loose.
    expect(subTree.looseTasks.map((t) => t.title)).toEqual(['orphan']);
  });

  it('returns undefined for an unknown goalId', async () => {
    expect(await getGoalTree('does-not-exist')).toBeUndefined();
  });
});

describe('hierarchyRepository.getTaskLineages', () => {
  it('resolves subgoal -> goal lineage keyed by subgoalId', async () => {
    const goal = await createGoal(makeGoalInput({ title: 'Get into RWTH' }));
    const sub = await createSubgoal(
      makeSubgoalInput(goal.id, { title: 'German B2', order: 0 }),
    );
    const task = await createTask(makeTaskInput(sub.id, { title: 'A1 deck' }));

    const lineages = await getTaskLineages([task]);

    expect(lineages[sub.id]).toEqual({
      subgoalTitle: 'German B2',
      goalTitle: 'Get into RWTH',
    });
  });

  it('dedupes to one entry per subgoal for many tasks under it', async () => {
    const goal = await createGoal(makeGoalInput());
    const sub = await createSubgoal(makeSubgoalInput(goal.id, { order: 0 }));
    const t1 = await createTask(makeTaskInput(sub.id, { title: 't1', order: 0 }));
    const t2 = await createTask(makeTaskInput(sub.id, { title: 't2', order: 1 }));

    const lineages = await getTaskLineages([t1, t2]);

    // Both tasks share the one subgoal -> a single keyed entry.
    expect(Object.keys(lineages)).toEqual([sub.id]);
  });

  it('omits a task whose subgoal no longer exists', async () => {
    // A dangling task (its subgoal was deleted) yields no lineage rather than
    // throwing — the dashboard just renders the task with no context line.
    const orphan = await createTask(
      makeTaskInput('missing-subgoal', { title: 'orphan' }),
    );

    const lineages = await getTaskLineages([orphan]);

    expect(lineages).toEqual({});
  });

  it('returns an empty map for no tasks', async () => {
    expect(await getTaskLineages([])).toEqual({});
  });
});

describe('hierarchyRepository.getTasksByGoalId', () => {
  it('flattens every task across all of a goal\'s subgoals', async () => {
    const goal = await createGoal(makeGoalInput());
    const subA = await createSubgoal(makeSubgoalInput(goal.id, { order: 0 }));
    const subB = await createSubgoal(makeSubgoalInput(goal.id, { order: 1 }));
    await createTask(makeTaskInput(subA.id, { title: 'a1', order: 0 }));
    await createTask(makeTaskInput(subA.id, { title: 'a2', order: 1 }));
    await createTask(makeTaskInput(subB.id, { title: 'b1', order: 0 }));

    const tasks = await getTasksByGoalId(goal.id);

    expect(tasks.map((t) => t.title).sort()).toEqual(['a1', 'a2', 'b1']);
  });

  it('returns an empty array for a goal with no tasks', async () => {
    const goal = await createGoal(makeGoalInput());
    await createSubgoal(makeSubgoalInput(goal.id, { order: 0 }));

    expect(await getTasksByGoalId(goal.id)).toEqual([]);
  });

  it('returns an empty array for an unknown goalId', async () => {
    expect(await getTasksByGoalId('does-not-exist')).toEqual([]);
  });
});
