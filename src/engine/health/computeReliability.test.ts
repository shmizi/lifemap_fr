import { describe, it, expect } from 'vitest'
import type { Task } from '@/core/types'
import { computeReliability } from '@/engine/health/computeReliability'

const NOW = new Date('2026-07-21T12:00:00.000Z')

let seq = 0
function task(overrides: Partial<Task>): Task {
  seq += 1
  return {
    id: `t${seq}`,
    subgoalId: 's1',
    title: 'task',
    status: 'pending',
    priority: 'medium',
    isRecurring: false,
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('computeReliability', () => {
  it('is no_history when nothing has completed or come due yet', () => {
    const r = computeReliability(
      [
        task({ status: 'pending', scheduledDate: '2026-08-01' }), // future, not due
        task({}), // undated pending
      ],
      NOW,
    )
    expect(r.status).toBe('no_history')
    expect(r.score).toBe(100)
    expect(r.openMisses).toBe(0)
  })

  it('is a perfect 100 for an on-time completion', () => {
    const r = computeReliability(
      [
        task({
          status: 'completed',
          scheduledDate: '2026-07-21',
          completedAt: '2026-07-21T09:00:00.000Z',
        }),
      ],
      NOW,
    )
    expect(r.score).toBe(100)
    expect(r.status).toBe('reliable')
    expect(r.onTimeCompletions).toBe(1)
    expect(r.reschedules).toBe(0)
  })

  it('dents the score for each reschedule and counts them', () => {
    // Finished, but pulled forward from overdue twice: quality 1 - 0.25*2 = 0.5.
    const r = computeReliability(
      [
        task({
          status: 'completed',
          scheduledDate: '2026-07-21',
          completedAt: '2026-07-21T09:00:00.000Z',
          rescheduleCount: 2,
        }),
      ],
      NOW,
    )
    expect(r.score).toBe(50)
    expect(r.status).toBe('unreliable')
    expect(r.reschedules).toBe(2)
    // A rescheduled-then-finished task is not an "on-time" completion.
    expect(r.onTimeCompletions).toBe(0)
  })

  it('penalises a late completion and tallies it', () => {
    // Completed a day after its scheduled date: quality 1 - 0.2 = 0.8.
    const r = computeReliability(
      [
        task({
          status: 'completed',
          scheduledDate: '2026-07-20',
          completedAt: '2026-07-21T09:00:00.000Z',
        }),
      ],
      NOW,
    )
    expect(r.score).toBe(80)
    expect(r.lateCompletions).toBe(1)
    expect(r.onTimeCompletions).toBe(0)
  })

  it('scores an open miss (past due, not done) low', () => {
    const r = computeReliability(
      [task({ status: 'pending', scheduledDate: '2026-07-20' })],
      NOW,
    )
    expect(r.openMisses).toBe(1)
    expect(r.status).toBe('unreliable')
    expect(r.score).toBeLessThan(30)
  })

  it('keeps a rescheduled-but-unfinished task dented (no clean slate on reschedule)', () => {
    // Re-planned to a future day after one reschedule: quality 1 - 0.25 = 0.75.
    // Crucially NOT 100 — moving an open miss forward doesn't erase the slip.
    const r = computeReliability(
      [
        task({
          status: 'pending',
          scheduledDate: '2026-07-28', // future — not an open miss anymore
          rescheduleCount: 1,
          updatedAt: '2026-07-21T09:00:00.000Z',
        }),
      ],
      NOW,
    )
    expect(r.score).toBe(75)
    expect(r.status).toBe('wavering')
    expect(r.reschedules).toBe(1)
    expect(r.openMisses).toBe(0)
  })

  it('recovers: an OLD slip barely counts against recent consistency', () => {
    const r = computeReliability(
      [
        // A bad slip ~120 days ago (heavily reschedule-penalised).
        task({
          status: 'completed',
          scheduledDate: '2026-03-23',
          completedAt: '2026-03-23T09:00:00.000Z',
          rescheduleCount: 3,
        }),
        // Three on-time completions today.
        task({ status: 'completed', scheduledDate: '2026-07-21', completedAt: '2026-07-21T08:00:00.000Z' }),
        task({ status: 'completed', scheduledDate: '2026-07-21', completedAt: '2026-07-21T09:00:00.000Z' }),
        task({ status: 'completed', scheduledDate: '2026-07-21', completedAt: '2026-07-21T10:00:00.000Z' }),
      ],
      NOW,
    )
    // Recency weighting (30-day half-life) means the old slip is nearly weightless.
    expect(r.score).toBeGreaterThanOrEqual(95)
    expect(r.status).toBe('reliable')
    expect(r.reschedules).toBe(3)
  })

  it('weights a RECENT slip more heavily than the same slip long ago', () => {
    const recentSlip = computeReliability(
      [
        task({ status: 'completed', scheduledDate: '2026-07-21', completedAt: '2026-07-21T09:00:00.000Z', rescheduleCount: 3 }),
        task({ status: 'completed', scheduledDate: '2026-07-21', completedAt: '2026-07-21T10:00:00.000Z' }),
      ],
      NOW,
    )
    const oldSlip = computeReliability(
      [
        task({ status: 'completed', scheduledDate: '2026-03-23', completedAt: '2026-03-23T09:00:00.000Z', rescheduleCount: 3 }),
        task({ status: 'completed', scheduledDate: '2026-07-21', completedAt: '2026-07-21T10:00:00.000Z' }),
      ],
      NOW,
    )
    expect(oldSlip.score).toBeGreaterThan(recentSlip.score)
  })
})
