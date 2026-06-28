import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/database/db';
import {
  USER_CONTEXT_ID,
  getUserContext,
  saveUserContext,
  getGoalContext,
  saveGoalContext,
  deleteGoalContext,
  type SaveUserContextInput,
  type SaveGoalContextInput,
} from './contextRepository';

function makeUserInput(
  overrides: Partial<SaveUserContextInput> = {},
): SaveUserContextInput {
  return {
    situation: 'student',
    lightDays: [0, 6],
    bestTimeOfDay: 'morning',
    workRhythm: 'structured',
    ...overrides,
  };
}

function makeGoalInput(
  overrides: Partial<SaveGoalContextInput> = {},
): SaveGoalContextInput {
  return {
    goalId: 'goal-1',
    deadlineHardness: 'soft',
    ...overrides,
  };
}

beforeEach(async () => {
  await db.userContext.clear();
  await db.goalContext.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('contextRepository — userContext (single row)', () => {
  it('getUserContext returns undefined before anything is saved', async () => {
    expect(await getUserContext()).toBeUndefined();
  });

  it('saveUserContext upserts the single fixed-id row with timestamps', async () => {
    const saved = await saveUserContext(makeUserInput());
    expect(saved.id).toBe(USER_CONTEXT_ID);
    expect(saved.createdAt).toBeTruthy();
    expect(saved.updatedAt).toBeTruthy();
    expect(saved.lightDays).toEqual([0, 6]);

    const fetched = await getUserContext();
    expect(fetched).toEqual(saved);
  });

  it('a second save preserves createdAt and refreshes updatedAt', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const first = await saveUserContext(makeUserInput());

    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    const second = await saveUserContext(makeUserInput({ situation: 'working' }));

    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).not.toBe(first.updatedAt);
    expect(second.situation).toBe('working');

    // Still exactly one row — it was upserted, not duplicated.
    expect(await db.userContext.count()).toBe(1);
  });
});

describe('contextRepository — goalContext (per goal)', () => {
  it('getGoalContext returns undefined for an unknown goal', async () => {
    expect(await getGoalContext('nope')).toBeUndefined();
  });

  it('saveGoalContext upserts keyed by goalId with timestamps', async () => {
    const saved = await saveGoalContext(
      makeGoalInput({ deadlineHardness: 'hard', startingLevel: 'A2' }),
    );
    expect(saved.goalId).toBe('goal-1');
    expect(saved.deadlineHardness).toBe('hard');
    expect(saved.startingLevel).toBe('A2');
    expect(saved.createdAt).toBeTruthy();

    expect(await getGoalContext('goal-1')).toEqual(saved);
  });

  it('re-saving the same goal preserves createdAt and does not duplicate', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const first = await saveGoalContext(makeGoalInput());

    vi.setSystemTime(new Date('2026-03-01T00:00:00.000Z'));
    const second = await saveGoalContext(
      makeGoalInput({ deadlineHardness: 'hard' }),
    );

    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).not.toBe(first.updatedAt);
    expect(await db.goalContext.count()).toBe(1);
  });

  it('deleteGoalContext removes the row and is idempotent', async () => {
    await saveGoalContext(makeGoalInput());
    await deleteGoalContext('goal-1');
    expect(await getGoalContext('goal-1')).toBeUndefined();
    // Deleting again is a no-op, not an error.
    await expect(deleteGoalContext('goal-1')).resolves.toBeUndefined();
  });
});
