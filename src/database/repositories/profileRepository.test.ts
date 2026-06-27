import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/database/db';
import {
  getProfile,
  saveProfile,
  PROFILE_ID,
  type SaveProfileInput,
} from './profileRepository';

function makeInput(overrides: Partial<SaveProfileInput> = {}): SaveProfileInput {
  return {
    name: 'Aru',
    availableHoursPerDay: 3,
    timezone: 'Europe/Berlin',
    ...overrides,
  };
}

beforeEach(async () => {
  await db.profile.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('profileRepository', () => {
  it('getProfile returns undefined before anything is saved', async () => {
    expect(await getProfile()).toBeUndefined();
  });

  it('saveProfile creates the single row with the fixed id and timestamps', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-27T10:00:00.000Z'));

    const saved = await saveProfile(makeInput());

    expect(saved.id).toBe(PROFILE_ID);
    expect(saved.name).toBe('Aru');
    expect(saved.availableHoursPerDay).toBe(3);
    expect(saved.timezone).toBe('Europe/Berlin');
    // First save sets both stamps to the same moment.
    expect(saved.createdAt).toBe('2026-06-27T10:00:00.000Z');
    expect(saved.updatedAt).toBe('2026-06-27T10:00:00.000Z');

    // It is persisted and reads back identically.
    expect(await getProfile()).toEqual(saved);
  });

  it('saveProfile upserts: preserves createdAt, refreshes updatedAt and fields', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-27T10:00:00.000Z'));
    const first = await saveProfile(makeInput());

    // Save again later with changed fields.
    vi.setSystemTime(new Date('2026-06-28T09:30:00.000Z'));
    const second = await saveProfile(
      makeInput({ name: 'Arudra', availableHoursPerDay: 5 }),
    );

    // Same single row.
    expect(second.id).toBe(PROFILE_ID);
    // createdAt is the original; updatedAt moved to the new save.
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).toBe('2026-06-28T09:30:00.000Z');
    // Fields updated.
    expect(second.name).toBe('Arudra');
    expect(second.availableHoursPerDay).toBe(5);

    // Still exactly one row in the table.
    expect(await db.profile.count()).toBe(1);
  });
});
