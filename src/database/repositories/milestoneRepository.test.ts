import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/database/db';
import {
  createMilestone,
  getMilestoneById,
  getMilestonesBySubgoalId,
  getMilestonesByStatus,
  updateMilestone,
  deleteMilestone,
  type CreateMilestoneInput,
} from './milestoneRepository';

// Minimal valid create input; tests override fields as needed.
function makeInput(
  overrides: Partial<CreateMilestoneInput> = {}
): CreateMilestoneInput {
  return {
    subgoalId: 'subgoal-1',
    title: 'German A1',
    status: 'active',
    order: 0,
    aiSuggested: true,
    ...overrides,
  };
}

beforeEach(async () => {
  // Isolate every test — the milestones store is shared across the suite.
  await db.milestones.clear();
});

describe('milestoneRepository', () => {
  it('createMilestone generates id + createdAt and persists the row', async () => {
    const created = await createMilestone(makeInput({ title: 'German A1' }));

    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();
    expect(created.title).toBe('German A1');
    // Milestone has no updatedAt — make sure we did not invent one.
    expect('updatedAt' in created).toBe(false);

    const stored = await db.milestones.get(created.id);
    expect(stored).toEqual(created);
  });

  it('getMilestoneById returns the milestone, or undefined when missing', async () => {
    const created = await createMilestone(makeInput());

    expect(await getMilestoneById(created.id)).toEqual(created);
    expect(await getMilestoneById('does-not-exist')).toBeUndefined();
  });

  it('getMilestonesBySubgoalId returns only that subgoal, sorted by order asc', async () => {
    await createMilestone(makeInput({ subgoalId: 'sg-A', title: 'second', order: 2 }));
    await createMilestone(makeInput({ subgoalId: 'sg-A', title: 'first', order: 1 }));
    await createMilestone(makeInput({ subgoalId: 'sg-B', title: 'other', order: 1 }));

    const result = await getMilestonesBySubgoalId('sg-A');

    expect(result.map((m) => m.title)).toEqual(['first', 'second']);
  });

  it('getMilestonesByStatus filters by status', async () => {
    await createMilestone(makeInput({ status: 'locked', order: 0 }));
    await createMilestone(makeInput({ status: 'active', order: 1 }));
    await createMilestone(makeInput({ status: 'active', order: 2 }));

    const active = await getMilestonesByStatus('active');

    expect(active).toHaveLength(2);
    expect(active.every((m) => m.status === 'active')).toBe(true);
  });

  it('updateMilestone patches fields, leaves createdAt intact, and throws on missing id', async () => {
    const created = await createMilestone(makeInput({ status: 'active' }));

    await updateMilestone(created.id, {
      status: 'completed',
      completedAt: '2026-01-01T00:00:00.000Z',
    });

    const updated = await getMilestoneById(created.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.completedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(updated?.createdAt).toBe(created.createdAt); // untouched by update

    await expect(
      updateMilestone('missing-id', { status: 'completed' })
    ).rejects.toThrow();
  });

  it('deleteMilestone removes the row', async () => {
    const created = await createMilestone(makeInput());

    await deleteMilestone(created.id);

    expect(await getMilestoneById(created.id)).toBeUndefined();
  });
});