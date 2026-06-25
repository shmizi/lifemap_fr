import { describe, expect, it } from 'vitest'
import type { ISODate, Task } from '@/core/types'
import { rankTasks, DEFAULT_TOP_N } from './rankTasks'

const NOW = new Date('2026-06-18T12:00:00.000Z')

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Math.random()}`,
    subgoalId: 'subgoal-1',
    title: 'A task',
    status: 'pending',
    priority: 'medium',
    isRecurring: false,
    order: 0,
    createdAt: '2026-06-18T00:00:00.000Z',
    updatedAt: '2026-06-18T00:00:00.000Z',
    ...overrides,
  }
}

function day(offset: number): ISODate {
  const d = new Date(NOW)
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

describe('rankTasks', () => {
  it('returns at most topN tasks (default 3)', () => {
    const tasks = Array.from({ length: 6 }, () => makeTask())
    expect(rankTasks(tasks, NOW)).toHaveLength(DEFAULT_TOP_N)
    expect(rankTasks(tasks, NOW, 2)).toHaveLength(2)
  })

  it('excludes completed and skipped tasks', () => {
    const open = makeTask({ id: 'open', priority: 'high' })
    const done = makeTask({ id: 'done', priority: 'critical', status: 'completed' })
    const skipped = makeTask({ id: 'skip', priority: 'critical', status: 'skipped' })

    const ranked = rankTasks([open, done, skipped], NOW)

    expect(ranked.map((t) => t.id)).toEqual(['open'])
  })

  it('orders by score: an overdue task outranks a higher-priority but not-due one', () => {
    const overdueLow = makeTask({ id: 'overdue', priority: 'low', dueDate: day(-2) })
    const criticalNoDate = makeTask({ id: 'critical', priority: 'critical' })

    const ranked = rankTasks([criticalNoDate, overdueLow], NOW, 2)

    // Deadlines drive the focus list, so the overdue task comes first.
    expect(ranked.map((t) => t.id)).toEqual(['overdue', 'critical'])
  })

  it('breaks ties deterministically by createdAt (older first)', () => {
    const older = makeTask({
      id: 'older',
      priority: 'high',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    const newer = makeTask({
      id: 'newer',
      priority: 'high',
      createdAt: '2026-06-01T00:00:00.000Z',
    })

    const ranked = rankTasks([newer, older], NOW, 2)

    expect(ranked.map((t) => t.id)).toEqual(['older', 'newer'])
  })

  it('returns an empty list when there are no open tasks', () => {
    const done = makeTask({ status: 'completed' })
    expect(rankTasks([done], NOW)).toEqual([])
    expect(rankTasks([], NOW)).toEqual([])
  })

  it('breaks a tie in favour of a task whose subgoal supports active subgoals', () => {
    // Two otherwise-identical tasks (same priority, same createdAt). Only their
    // subgoals differ; sg-A supports 1 active subgoal, sg-B supports none.
    const supported = makeTask({ id: 'supported', subgoalId: 'sg-A' })
    const plain = makeTask({ id: 'plain', subgoalId: 'sg-B' })

    // `plain` is first in input; the boost must still lift `supported` above it.
    const ranked = rankTasks([plain, supported], NOW, 2, { 'sg-A': 1 })

    expect(ranked.map((t) => t.id)).toEqual(['supported', 'plain'])
  })

  it('the boost cannot lift a low-priority supporter over a high-priority task', () => {
    // Even maxed-out support (+6) must not overtake a full priority step (high=25
    // vs low=0). Urgency/priority stay dominant; the dependency signal is a nudge.
    const highPlain = makeTask({ id: 'high', priority: 'high', subgoalId: 'sg-B' })
    const lowSupporter = makeTask({ id: 'low', priority: 'low', subgoalId: 'sg-A' })

    const ranked = rankTasks([lowSupporter, highPlain], NOW, 2, { 'sg-A': 99 })

    expect(ranked.map((t) => t.id)).toEqual(['high', 'low'])
  })
})
