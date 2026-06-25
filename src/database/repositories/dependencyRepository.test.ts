import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/database/db';
import {
  createDependency,
  getDependenciesBlocking,
  getDependenciesDownstreamOf,
  getDependenciesByType,
  deleteDependency,
  type CreateDependencyInput,
} from './dependencyRepository';

// Minimal valid create input; tests override fields as needed.
function makeInput(
  overrides: Partial<CreateDependencyInput> = {}
): CreateDependencyInput {
  return {
    fromId: 'task-A',
    toId: 'task-B',
    type: 'task',
    ...overrides,
  };
}

beforeEach(async () => {
  // Isolate every test — the dependencies store is shared across the suite.
  await db.dependencies.clear();
});

describe('dependencyRepository', () => {
  it('createDependency generates id + createdAt and persists the row', async () => {
    const created = await createDependency(makeInput());

    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();
    expect(created.fromId).toBe('task-A');
    expect(created.toId).toBe('task-B');
    expect(created.type).toBe('task');
    // Dependency has no updatedAt — make sure we did not invent one.
    expect('updatedAt' in created).toBe(false);

    const stored = await db.dependencies.get(created.id);
    expect(stored).toEqual(created);
  });

  it('getDependenciesBlocking returns edges whose toId is the entity', async () => {
    // X blocks B, Y blocks B, B blocks C. Blocking(B) = the edges into B (X, Y).
    await createDependency(makeInput({ fromId: 'X', toId: 'B' }));
    await createDependency(makeInput({ fromId: 'Y', toId: 'B' }));
    await createDependency(makeInput({ fromId: 'B', toId: 'C' }));

    const blocking = await getDependenciesBlocking('B');

    expect(blocking).toHaveLength(2);
    expect(blocking.every((d) => d.toId === 'B')).toBe(true);
    expect(blocking.map((d) => d.fromId).sort()).toEqual(['X', 'Y']);
  });

  it('getDependenciesDownstreamOf returns edges whose fromId is the entity', async () => {
    // B blocks C, B blocks D, X blocks B. Downstream(B) = the edges out of B (C, D).
    await createDependency(makeInput({ fromId: 'B', toId: 'C' }));
    await createDependency(makeInput({ fromId: 'B', toId: 'D' }));
    await createDependency(makeInput({ fromId: 'X', toId: 'B' }));

    const downstream = await getDependenciesDownstreamOf('B');

    expect(downstream).toHaveLength(2);
    expect(downstream.every((d) => d.fromId === 'B')).toBe(true);
    expect(downstream.map((d) => d.toId).sort()).toEqual(['C', 'D']);
  });

  it('the two directional queries are inverses of each other for the same edge', async () => {
    // A single edge A -> B should surface as downstream-of-A AND blocking-B,
    // and nowhere else. Guards against accidentally swapping fromId/toId.
    const edge = await createDependency(makeInput({ fromId: 'A', toId: 'B' }));

    expect(await getDependenciesDownstreamOf('A')).toEqual([edge]);
    expect(await getDependenciesBlocking('B')).toEqual([edge]);
    expect(await getDependenciesBlocking('A')).toEqual([]);
    expect(await getDependenciesDownstreamOf('B')).toEqual([]);
  });

  it('getDependenciesByType returns only edges of that type', async () => {
    await createDependency(makeInput({ fromId: 'T1', toId: 'T2', type: 'task' }));
    await createDependency(makeInput({ fromId: 'T2', toId: 'T3', type: 'task' }));
    await createDependency(
      makeInput({ fromId: 'S1', toId: 'S2', type: 'subgoal' })
    );

    const taskEdges = await getDependenciesByType('task');
    const subgoalEdges = await getDependenciesByType('subgoal');

    expect(taskEdges).toHaveLength(2);
    expect(taskEdges.every((d) => d.type === 'task')).toBe(true);
    expect(subgoalEdges).toHaveLength(1);
    expect(subgoalEdges[0].fromId).toBe('S1');
  });

  it('deleteDependency removes the row', async () => {
    const created = await createDependency(makeInput());

    await deleteDependency(created.id);

    expect(await db.dependencies.get(created.id)).toBeUndefined();
  });

  it('deleteDependency is idempotent on an unknown id (no throw)', async () => {
    await expect(deleteDependency('does-not-exist')).resolves.toBeUndefined();
  });
});
