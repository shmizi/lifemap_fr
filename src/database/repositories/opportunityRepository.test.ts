import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/database/db';
import {
  createOpportunity,
  getAllOpportunities,
  getOpportunityById,
  updateOpportunity,
  deleteOpportunity,
  type CreateOpportunityInput,
} from './opportunityRepository';

// Minimal valid create input; tests override fields as needed.
function makeInput(
  overrides: Partial<CreateOpportunityInput> = {},
): CreateOpportunityInput {
  return {
    type: 'internship',
    title: 'ML Research Internship',
    organization: 'Acme Labs',
    description: 'Summer research on machine learning.',
    url: 'https://example.com/internship',
    matchedGoalIds: [],
    tags: ['ML'],
    source: 'ai_search',
    addedToRoadmap: false,
    dismissed: false,
    ...overrides,
  };
}

beforeEach(async () => {
  // Isolate every test — the opportunities table is shared across the suite.
  await db.opportunities.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('opportunityRepository', () => {
  it('createOpportunity generates an id and a savedAt stamp', async () => {
    const created = await createOpportunity(makeInput());
    expect(created.id).toBeTruthy();
    expect(created.savedAt).toBeTruthy();
    // The caller's fields survive untouched.
    expect(created.title).toBe('ML Research Internship');
    expect(created.source).toBe('ai_search');

    // It is actually persisted and reads back identically.
    const fetched = await getOpportunityById(created.id);
    expect(fetched).toEqual(created);
  });

  it('getOpportunityById returns undefined for an unknown id', async () => {
    expect(await getOpportunityById('does-not-exist')).toBeUndefined();
  });

  it('getAllOpportunities returns most-recently-saved first', async () => {
    // Deterministic savedAt stamps via fake timers so the ordering is exact.
    vi.useFakeTimers({ toFake: ['Date'] });

    vi.setSystemTime(new Date('2026-06-20T00:00:00.000Z'));
    const older = await createOpportunity(makeInput({ title: 'Older' }));

    vi.setSystemTime(new Date('2026-06-25T00:00:00.000Z'));
    const newer = await createOpportunity(makeInput({ title: 'Newer' }));

    const all = await getAllOpportunities();
    expect(all.map((o) => o.id)).toEqual([newer.id, older.id]);
  });

  it('updateOpportunity patches fields in place (e.g. dismissing)', async () => {
    const created = await createOpportunity(makeInput());
    await updateOpportunity(created.id, { dismissed: true });

    const fetched = await getOpportunityById(created.id);
    expect(fetched?.dismissed).toBe(true);
    // savedAt is immutable — the patch never touches it.
    expect(fetched?.savedAt).toBe(created.savedAt);
  });

  it('updateOpportunity can mark an opportunity added to the roadmap', async () => {
    const created = await createOpportunity(makeInput());
    await updateOpportunity(created.id, { addedToRoadmap: true });
    expect((await getOpportunityById(created.id))?.addedToRoadmap).toBe(true);
  });

  it('updateOpportunity throws when no row matches the id', async () => {
    await expect(
      updateOpportunity('missing', { dismissed: true }),
    ).rejects.toThrow(/no opportunity found/);
  });

  it('deleteOpportunity removes the row and is a no-op for unknown ids', async () => {
    const created = await createOpportunity(makeInput());
    await deleteOpportunity(created.id);
    expect(await getOpportunityById(created.id)).toBeUndefined();

    // Deleting again (now unknown) must not throw.
    await expect(deleteOpportunity(created.id)).resolves.toBeUndefined();
  });
});
