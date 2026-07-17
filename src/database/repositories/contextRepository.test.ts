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
  getStrategyBrief,
  saveStrategyBrief,
  type SaveUserContextInput,
  type SaveGoalContextInput,
} from './contextRepository';
import type { StrategyBrief } from '@/core/types';

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

describe('contextRepository — strategyBrief (Phase 10, on the goalContext row)', () => {
  const brief: StrategyBrief = {
    sharpenedTarget: 'Be competitive for top robotics grad schools by 2028',
    theme: 'Intelligent Autonomous Systems',
    priorities: [{ title: 'DSA', rationale: 'Highest ROI' }],
    notes: ['Keep GATE and GRE both open'],
  };

  it('getStrategyBrief is undefined before one is saved', async () => {
    await saveGoalContext(makeGoalInput());
    expect(await getStrategyBrief('goal-1')).toBeUndefined();
  });

  it('saveStrategyBrief creates a context row when none exists (soft default)', async () => {
    const saved = await saveStrategyBrief('goal-1', brief);
    expect(saved.deadlineHardness).toBe('soft');
    expect(saved.strategyBrief).toEqual(brief);
    expect(await getStrategyBrief('goal-1')).toEqual(brief);
    expect(await db.goalContext.count()).toBe(1);
  });

  it('saveStrategyBrief PRESERVES existing intake fields (read-modify-write)', async () => {
    await saveGoalContext(
      makeGoalInput({ deadlineHardness: 'hard', startingLevel: 'A2', motivation: 'study abroad' }),
    );
    const saved = await saveStrategyBrief('goal-1', brief);
    expect(saved.deadlineHardness).toBe('hard'); // not clobbered by the soft default
    expect(saved.startingLevel).toBe('A2');
    expect(saved.motivation).toBe('study abroad');
    expect(saved.strategyBrief).toEqual(brief);
  });

  it('a later intake save does NOT wipe an already-generated brief', async () => {
    await saveStrategyBrief('goal-1', brief);
    // The intake form re-saves without a brief field...
    const after = await saveGoalContext(makeGoalInput({ startingLevel: 'B1' }));
    expect(after.startingLevel).toBe('B1');
    expect(after.strategyBrief).toEqual(brief); // still there
  });

  it('saveStrategyBrief preserves createdAt and refreshes updatedAt', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const first = await saveStrategyBrief('goal-1', brief);

    vi.setSystemTime(new Date('2026-04-01T00:00:00.000Z'));
    const second = await saveStrategyBrief('goal-1', { ...brief, theme: 'Updated' });

    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).not.toBe(first.updatedAt);
    expect(second.strategyBrief?.theme).toBe('Updated');
    expect(await db.goalContext.count()).toBe(1);
  });
});
