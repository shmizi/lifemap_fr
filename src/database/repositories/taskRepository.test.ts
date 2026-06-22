import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/database/db';
import {
  createTask,
  getTaskById,
  getTasksBySubgoalId,
  getTasksByMilestoneId,
  getTasksByStatus,
  getTasksByScheduledDate,
  getTasksScheduledBetween,
  getTasksScheduledBefore,
  updateTask,
  deleteTask,
  type CreateTaskInput,
} from './taskRepository';

function makeInput(overrides: Partial<CreateTaskInput> = {}): CreateTaskInput {
  return {
    subgoalId: 'subgoal-1',
    title: 'Solve 3 graph problems',
    status: 'pending',
    priority: 'medium',
    isRecurring: false,
    order: 0,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.tasks.clear();
});

afterEach(() => {
  // Guard against a test leaving fake timers installed.
  vi.useRealTimers();
});

describe('taskRepository', () => {
  it('createTask generates id + equal createdAt/updatedAt and persists the row', async () => {
    const created = await createTask(makeInput({ title: 'Solve 3 graph problems' }));

    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();
    // Freshly created → both stamps identical.
    expect(created.updatedAt).toBe(created.createdAt);

    const stored = await db.tasks.get(created.id);
    expect(stored).toEqual(created);
  });

  it('getTaskById returns the task, or undefined when missing', async () => {
    const created = await createTask(makeInput());

    expect(await getTaskById(created.id)).toEqual(created);
    expect(await getTaskById('does-not-exist')).toBeUndefined();
  });

  it('getTasksBySubgoalId returns only that subgoal, sorted by order asc', async () => {
    await createTask(makeInput({ subgoalId: 'sg-A', title: 'second', order: 2 }));
    await createTask(makeInput({ subgoalId: 'sg-A', title: 'first', order: 1 }));
    await createTask(makeInput({ subgoalId: 'sg-B', title: 'other', order: 1 }));

    const result = await getTasksBySubgoalId('sg-A');

    expect(result.map((t) => t.title)).toEqual(['first', 'second']);
  });

  it('getTasksByMilestoneId returns only that milestone, excluding tasks with no milestoneId', async () => {
    await createTask(makeInput({ milestoneId: 'm-A', title: 'b', order: 2 }));
    await createTask(makeInput({ milestoneId: 'm-A', title: 'a', order: 1 }));
    await createTask(makeInput({ title: 'direct-on-subgoal', order: 1 })); // no milestoneId

    const result = await getTasksByMilestoneId('m-A');

    expect(result.map((t) => t.title)).toEqual(['a', 'b']);
  });

  it('getTasksByStatus filters by status', async () => {
    await createTask(makeInput({ status: 'pending', order: 0 }));
    await createTask(makeInput({ status: 'completed', order: 1 }));
    await createTask(makeInput({ status: 'completed', order: 2 }));

    const completed = await getTasksByStatus('completed');

    expect(completed).toHaveLength(2);
    expect(completed.every((t) => t.status === 'completed')).toBe(true);
  });

  it('getTasksByScheduledDate returns exact matches only', async () => {
    await createTask(makeInput({ scheduledDate: '2026-06-10', title: 'today' }));
    await createTask(makeInput({ scheduledDate: '2026-06-11', title: 'tomorrow' }));
    await createTask(makeInput({ title: 'unscheduled' })); // no scheduledDate

    const result = await getTasksByScheduledDate('2026-06-10');

    expect(result.map((t) => t.title)).toEqual(['today']);
  });

  it('getTasksScheduledBetween returns rows within inclusive bounds, ascending, excluding unscheduled', async () => {
    // scheduledDate is written date-only (YYYY-MM-DD) — the canonical format.
    // Inserted shuffled on purpose: proves the result is ordered by
    // scheduledDate, not by insertion order.
    await createTask(makeInput({ scheduledDate: '2026-06-14', title: 'd14' })); // == end  -> included (upper bound inclusive)
    await createTask(makeInput({ scheduledDate: '2026-06-08', title: 'd08' })); // <  start -> excluded
    await createTask(makeInput({ scheduledDate: '2026-06-10', title: 'd10' })); // == start -> included (lower bound inclusive)
    await createTask(makeInput({ scheduledDate: '2026-06-16', title: 'd16' })); // >  end   -> excluded
    await createTask(makeInput({ scheduledDate: '2026-06-12', title: 'd12' })); // middle  -> included
    await createTask(makeInput({ title: 'unscheduled' }));                      // no scheduledDate -> excluded

    const result = await getTasksScheduledBetween('2026-06-10', '2026-06-14');

    // Both ends present, outside-range and unscheduled absent, ascending order.
    expect(result.map((t) => t.title)).toEqual(['d10', 'd12', 'd14']);
  });

  it('getTasksScheduledBetween with start === end is the single-day "today" query', async () => {
    // A date-only Today lookup collapses to a one-day window: both bounds equal
    // the same calendar day. This is the path loadTodaysTasks drives.
    await createTask(makeInput({ scheduledDate: '2026-06-14', title: 'yesterday' }));
    await createTask(makeInput({ scheduledDate: '2026-06-15', title: 'today' }));
    await createTask(makeInput({ scheduledDate: '2026-06-16', title: 'tomorrow' }));

    const result = await getTasksScheduledBetween('2026-06-15', '2026-06-15');

    expect(result.map((t) => t.title)).toEqual(['today']);
  });

  it('getTasksScheduledBefore returns strictly-earlier rows, ascending, excluding the bound and unscheduled', async () => {
    // The dashboard's overdue list drives this: everything scheduled before
    // today. The bound is EXCLUSIVE, so a task on the bound date is not "before".
    await createTask(makeInput({ scheduledDate: '2026-06-12', title: 'd12' })); // <  before -> included
    await createTask(makeInput({ scheduledDate: '2026-06-15', title: 'd15' })); // == before -> excluded (exclusive)
    await createTask(makeInput({ scheduledDate: '2026-06-16', title: 'd16' })); // >  before -> excluded
    await createTask(makeInput({ scheduledDate: '2026-06-10', title: 'd10' })); // <  before -> included
    await createTask(makeInput({ title: 'unscheduled' }));                      // no scheduledDate -> excluded

    const result = await getTasksScheduledBefore('2026-06-15');

    // Only the two earlier rows, oldest first; bound date and unscheduled absent.
    expect(result.map((t) => t.title)).toEqual(['d10', 'd12']);
  });

  it('updateTask patches fields, refreshes updatedAt, preserves createdAt, throws on missing id', async () => {
    // Fake ONLY Date — not setTimeout/queueMicrotask. fake-indexeddb relies on
    // the real async scheduler to flush transactions, so faking all timers would
    // deadlock every await db.* call. This gives deterministic timestamps while
    // keeping Dexie operations alive.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const created = await createTask(makeInput({ status: 'pending' }));

    vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
    await updateTask(created.id, { status: 'completed' });

    const updated = await getTaskById(created.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.createdAt).toBe('2026-01-01T00:00:00.000Z'); // untouched
    expect(updated?.updatedAt).toBe('2026-01-02T00:00:00.000Z'); // refreshed

    await expect(updateTask('missing-id', { status: 'completed' })).rejects.toThrow();
  });

  it('deleteTask removes the row', async () => {
    const created = await createTask(makeInput());

    await deleteTask(created.id);

    expect(await getTaskById(created.id)).toBeUndefined();
  });

  it('updateTask with milestoneId: undefined CLEARS the property and its index entry', async () => {
    // This is the behavior the milestone-rehome path depends on: passing
    // `undefined` to Dexie's update() must DELETE the property (not store a stale
    // value), which also removes the row from the milestoneId index.
    const created = await createTask(
      makeInput({ subgoalId: 'sub-1', milestoneId: 'm-1' }),
    );

    // Sanity: indexed under the milestone before clearing.
    expect(
      (await getTasksByMilestoneId('m-1')).map((t) => t.id),
    ).toEqual([created.id]);

    await updateTask(created.id, { milestoneId: undefined });

    // Property is gone from the stored row...
    const after = await getTaskById(created.id);
    expect(after).toBeDefined();
    expect(after!.milestoneId).toBeUndefined();
    expect('milestoneId' in after!).toBe(false); // truly deleted, not set to undefined

    // ...the milestoneId index no longer returns it...
    expect(await getTasksByMilestoneId('m-1')).toEqual([]);
    // ...but it is still reachable via its (unchanged) subgoal.
    expect((await getTasksBySubgoalId('sub-1')).map((t) => t.id)).toEqual([
      created.id,
    ]);
  });
});