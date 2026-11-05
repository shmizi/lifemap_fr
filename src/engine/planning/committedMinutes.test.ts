import { describe, it, expect } from 'vitest'
import {
  committedOn,
  computeCommittedMinutesByDay,
  findOvercommittedDays,
  mergeCommittedMinutes,
  type CommittedCandidate,
} from './committedMinutes'

const task = (over: Partial<CommittedCandidate> & { id: string }): CommittedCandidate => ({
  scheduledDate: '2026-08-10',
  status: 'pending',
  estimatedMinutes: 30,
  ...over,
})

describe('computeCommittedMinutesByDay', () => {
  it('sums minutes per day across tasks from different goals', () => {
    const map = computeCommittedMinutesByDay(
      [
        task({ id: 'a', scheduledDate: '2026-08-10', estimatedMinutes: 45 }),
        task({ id: 'b', scheduledDate: '2026-08-10', estimatedMinutes: 30 }),
        task({ id: 'c', scheduledDate: '2026-08-11', estimatedMinutes: 60 }),
      ],
      { defaultMinutes: 25 },
    )
    expect(map).toEqual({ '2026-08-10': 75, '2026-08-11': 60 })
  })

  it('falls back to defaultMinutes for a task with no estimate', () => {
    const map = computeCommittedMinutesByDay(
      [task({ id: 'a', estimatedMinutes: undefined })],
      { defaultMinutes: 25 },
    )
    expect(map['2026-08-10']).toBe(25)
  })

  it('excludes completed work — it consumed a past day, not a future one', () => {
    const map = computeCommittedMinutesByDay(
      [
        task({ id: 'a', status: 'completed', estimatedMinutes: 90 }),
        task({ id: 'b', estimatedMinutes: 30 }),
      ],
      { defaultMinutes: 25 },
    )
    expect(map['2026-08-10']).toBe(30)
  })

  it('excludes undated backlog — it claims no day', () => {
    const map = computeCommittedMinutesByDay(
      [task({ id: 'a', scheduledDate: undefined })],
      { defaultMinutes: 25 },
    )
    expect(map).toEqual({})
  })

  it('excludes the ids being re-placed, so a move never blocks itself', () => {
    const map = computeCommittedMinutesByDay(
      [
        task({ id: 'moving', estimatedMinutes: 90 }),
        task({ id: 'staying', estimatedMinutes: 30 }),
      ],
      { defaultMinutes: 25, excludeIds: new Set(['moving']) },
    )
    expect(map['2026-08-10']).toBe(30)
  })

  it('is empty for no tasks', () => {
    expect(computeCommittedMinutesByDay([], { defaultMinutes: 25 })).toEqual({})
  })
})

describe('mergeCommittedMinutes', () => {
  it('adds overlapping days and keeps disjoint ones, mutating neither input', () => {
    const a = { '2026-08-10': 60, '2026-08-11': 30 }
    const b = { '2026-08-10': 15, '2026-08-12': 45 }
    expect(mergeCommittedMinutes(a, b)).toEqual({
      '2026-08-10': 75,
      '2026-08-11': 30,
      '2026-08-12': 45,
    })
    expect(a).toEqual({ '2026-08-10': 60, '2026-08-11': 30 })
    expect(b).toEqual({ '2026-08-10': 15, '2026-08-12': 45 })
  })
})

describe('committedOn', () => {
  it('reads a day, defaulting an untouched day to zero', () => {
    const map = { '2026-08-10': 60 }
    expect(committedOn(map, '2026-08-10')).toBe(60)
    expect(committedOn(map, '2026-08-99')).toBe(0)
  })
})

describe('findOvercommittedDays', () => {
  it('returns only days OVER budget, soonest first', () => {
    const map = {
      '2026-08-12': 300,
      '2026-08-10': 500,
      '2026-08-11': 120,
    }
    expect(findOvercommittedDays(map, 240)).toEqual([
      { day: '2026-08-10', minutes: 500 },
      { day: '2026-08-12', minutes: 300 },
    ])
  })

  it('treats a day exactly at budget as full, not over', () => {
    expect(findOvercommittedDays({ '2026-08-10': 240 }, 240)).toEqual([])
  })

  it('is empty for an empty calendar', () => {
    expect(findOvercommittedDays({}, 240)).toEqual([])
  })
})
