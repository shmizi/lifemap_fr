import { describe, it, expect } from 'vitest'
import { isOverdue, type OverdueCandidate } from './isOverdue'

const TODAY = '2026-08-09'

const task = (over: Partial<OverdueCandidate>): OverdueCandidate => ({
  scheduledDate: undefined,
  status: 'pending',
  ...over,
})

describe('isOverdue', () => {
  it('flags a pending task dated before today', () => {
    expect(isOverdue(task({ scheduledDate: '2026-08-08' }), TODAY)).toBe(true)
  })

  it('does NOT flag a task scheduled for today (the day is still in progress)', () => {
    expect(isOverdue(task({ scheduledDate: TODAY }), TODAY)).toBe(false)
  })

  it('does NOT flag a future task', () => {
    expect(isOverdue(task({ scheduledDate: '2026-08-10' }), TODAY)).toBe(false)
  })

  it('does NOT flag a completed past task — it is no longer owed', () => {
    expect(
      isOverdue(task({ scheduledDate: '2026-08-01', status: 'completed' }), TODAY),
    ).toBe(false)
  })

  it('does NOT flag an undated backlog task — it was never promised to a day', () => {
    expect(isOverdue(task({}), TODAY)).toBe(false)
  })

  it('flags a non-pending-but-open past task (e.g. in_progress)', () => {
    expect(
      isOverdue(task({ scheduledDate: '2026-08-01', status: 'in_progress' }), TODAY),
    ).toBe(true)
  })

  it('compares date-only strings lexicographically across a year boundary', () => {
    expect(isOverdue(task({ scheduledDate: '2025-12-31' }), '2026-01-01')).toBe(true)
  })
})
