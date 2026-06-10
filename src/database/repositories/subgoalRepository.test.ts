import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import {
  createSubgoal,
  getSubgoalById,
  getSubgoalsByGoalId,
  getSubgoalsByStatus,
  updateSubgoal,
  deleteSubgoal,
} from './subgoalRepository';
import type { Subgoal } from '@/core/types';

// A minimal valid subgoal payload (everything except id/createdAt/updatedAt).
// Overrides let each test set just the fields it cares about.
function makeSubgoalInput(
  overrides: Partial<Omit<Subgoal, 'id' | 'createdAt' | 'updatedAt'>> = {},
): Omit<Subgoal, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    goalId: 'goal-1',
    title: 'Get German to B2',
    description: '',
    status: 'not_started',
    requiresConsistency: true,
    order: 0,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.subgoals.clear();
});

describe('subgoalRepository', () => {
  it('createSubgoal stores goalId and order and populates id/timestamps', async () => {
    const created = await createSubgoal(makeSubgoalInput({ goalId: 'goal-7', order: 3 }));

    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();
    expect(created.updatedAt).toBe(created.createdAt);
    expect(created.goalId).toBe('goal-7');
    expect(created.order).toBe(3);

    const persisted = await db.subgoals.get(created.id);
    expect(persisted).toEqual(created);
  });

  it('getSubgoalById retrieves a subgoal and returns undefined for unknown id', async () => {
    const created = await createSubgoal(makeSubgoalInput());

    expect(await getSubgoalById(created.id)).toEqual(created);
    expect(await getSubgoalById('does-not-exist')).toBeUndefined();
  });

  it('getSubgoalsByGoalId returns only that goal\u2019s subgoals, sorted by order', async () => {
    // Inserted out of order, and under two different goals.
    await createSubgoal(makeSubgoalInput({ goalId: 'goal-A', title: 'second', order: 2 }));
    await createSubgoal(makeSubgoalInput({ goalId: 'goal-A', title: 'first', order: 0 }));
    await createSubgoal(makeSubgoalInput({ goalId: 'goal-A', title: 'middle', order: 1 }));
    await createSubgoal(makeSubgoalInput({ goalId: 'goal-B', title: 'other goal', order: 0 }));

    const result = await getSubgoalsByGoalId('goal-A');

    expect(result).toHaveLength(3);
    expect(result.every((s) => s.goalId === 'goal-A')).toBe(true);
    expect(result.map((s) => s.order)).toEqual([0, 1, 2]);
    expect(result.map((s) => s.title)).toEqual(['first', 'middle', 'second']);
  });

  it('getSubgoalsByStatus returns only subgoals with the matching status', async () => {
    await createSubgoal(makeSubgoalInput({ status: 'active', title: 'a' }));
    await createSubgoal(makeSubgoalInput({ status: 'active', title: 'b' }));
    await createSubgoal(makeSubgoalInput({ status: 'completed', title: 'c' }));

    const active = await getSubgoalsByStatus('active');
    expect(active).toHaveLength(2);
    expect(active.every((s) => s.status === 'active')).toBe(true);

    const completed = await getSubgoalsByStatus('completed');
    expect(completed).toHaveLength(1);
    expect(completed[0].title).toBe('c');
  });

  it('updateSubgoal applies changes, advances updatedAt, and throws on missing id', async () => {
    const created = await createSubgoal(makeSubgoalInput({ status: 'not_started' }));

    // Force a measurable gap so the ISO timestamp string is guaranteed to differ.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const updated = await updateSubgoal(created.id, { status: 'active', order: 9 });
    expect(updated.status).toBe('active');
    expect(updated.order).toBe(9);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt > created.updatedAt).toBe(true);

    await expect(updateSubgoal('does-not-exist', { status: 'active' })).rejects.toThrow(
      /no subgoal found/,
    );
  });

  it('deleteSubgoal removes the subgoal', async () => {
    const created = await createSubgoal(makeSubgoalInput());

    await deleteSubgoal(created.id);

    expect(await getSubgoalById(created.id)).toBeUndefined();
  });
});