// fake-indexeddb/auto must be imported before anything that touches Dexie, so
// that indexedDB exists as a global the moment db.ts constructs the database.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import {
  createGoal,
  getGoalById,
  getAllGoals,
  getGoalsByStatus,
  updateGoal,
  deleteGoal,
} from './goalRepository';
import type { Goal } from '@/core/types';

// A small factory so each test starts from a valid goal and overrides only the
// fields it cares about. Keeps the tests focused on behaviour, not boilerplate.
function makeGoalInput(
  overrides: Partial<Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>> = {},
): Omit<Goal, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    title: 'Get into RWTH Aachen',
    description: 'Long-term study-abroad goal',
    category: 'education',
    targetDate: '2027-09-01T00:00:00.000Z',
    status: 'active',
    priority: 'high',
    ...overrides,
  };
}

// fake-indexeddb resets between test files but not between tests in the same
// file, so we clear the table before each test for full isolation.
beforeEach(async () => {
  await db.goals.clear();
});

describe('goalRepository', () => {
  describe('createGoal', () => {
    it('creates a goal and returns it with id and timestamps set', async () => {
      const goal = await createGoal(makeGoalInput());

      expect(goal.id).toBeTruthy();
      expect(typeof goal.id).toBe('string');
      expect(goal.createdAt).toBeTruthy();
      expect(goal.updatedAt).toBeTruthy();
      // On creation the two timestamps are stamped from the same value.
      expect(goal.createdAt).toBe(goal.updatedAt);
      // Caller-supplied fields are preserved untouched.
      expect(goal.title).toBe('Get into RWTH Aachen');
      expect(goal.category).toBe('education');
    });
  });

  describe('getGoalById', () => {
    it('retrieves a goal that was just created', async () => {
      const created = await createGoal(makeGoalInput());
      const fetched = await getGoalById(created.id);

      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.title).toBe(created.title);
    });

    it('returns undefined for an unknown id', async () => {
      const fetched = await getGoalById('does-not-exist');
      expect(fetched).toBeUndefined();
    });
  });

  describe('getAllGoals', () => {
    it('returns multiple created goals', async () => {
      await createGoal(makeGoalInput({ title: 'Goal A' }));
      await createGoal(makeGoalInput({ title: 'Goal B' }));
      await createGoal(makeGoalInput({ title: 'Goal C' }));

      const all = await getAllGoals();
      expect(all).toHaveLength(3);
      const titles = all.map((g) => g.title).sort();
      expect(titles).toEqual(['Goal A', 'Goal B', 'Goal C']);
    });
  });

  describe('updateGoal', () => {
    it('reflects changes and advances updatedAt past createdAt', async () => {
      const created = await createGoal(makeGoalInput({ title: 'Old title' }));

      // Force a measurable gap so the updatedAt comparison is not flaky on fast
      // machines where two toISOString() calls could land on the same millisecond.
      await new Promise((resolve) => setTimeout(resolve, 5));

      const updated = await updateGoal(created.id, {
        title: 'New title',
        status: 'paused',
      });

      expect(updated.title).toBe('New title');
      expect(updated.status).toBe('paused');
      expect(updated.createdAt).toBe(created.createdAt);
      expect(updated.updatedAt > created.updatedAt).toBe(true);
    });

    it('throws when updating a goal that does not exist', async () => {
      await expect(updateGoal('missing-id', { title: 'x' })).rejects.toThrow(
        /no goal found/,
      );
    });
  });

  describe('deleteGoal', () => {
    it('removes the goal so it can no longer be fetched', async () => {
      const created = await createGoal(makeGoalInput());
      await deleteGoal(created.id);

      const fetched = await getGoalById(created.id);
      expect(fetched).toBeUndefined();
    });
  });

  describe('getGoalsByStatus', () => {
    it('returns only goals with the requested status', async () => {
      await createGoal(makeGoalInput({ title: 'Active 1', status: 'active' }));
      await createGoal(makeGoalInput({ title: 'Active 2', status: 'active' }));
      await createGoal(makeGoalInput({ title: 'Archived', status: 'archived' }));

      const active = await getGoalsByStatus('active');
      const archived = await getGoalsByStatus('archived');

      expect(active).toHaveLength(2);
      expect(active.every((g) => g.status === 'active')).toBe(true);
      expect(archived).toHaveLength(1);
      expect(archived[0]?.title).toBe('Archived');
    });
  });
});