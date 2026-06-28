import { describe, it, expect } from 'vitest'
import { dailyQuote } from './dailyQuote'
import { QUOTES, type Quote } from '@/core/data/quotes'

const sample: Quote[] = [
  ['a', 'A'],
  ['b', 'B'],
  ['c', 'C'],
  ['d', 'D'],
  ['e', 'E'],
]

describe('dailyQuote', () => {
  it('is deterministic for the same day', () => {
    const d = new Date('2026-06-28T00:00:00Z')
    expect(dailyQuote(d, sample)).toEqual(dailyQuote(d, sample))
  })

  it('changes from one day to the next', () => {
    const day1 = dailyQuote(new Date('2026-06-28T00:00:00Z'), sample)
    const day2 = dailyQuote(new Date('2026-06-29T00:00:00Z'), sample)
    expect(day1).not.toEqual(day2)
  })

  it('shows every quote exactly once before repeating (no repeats in a cycle)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < sample.length; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i))
      seen.add(dailyQuote(d, sample)[0])
    }
    expect(seen.size).toBe(sample.length)
  })

  it('is stable across the cycle boundary (day N maps like day 0)', () => {
    const day0 = dailyQuote(new Date(Date.UTC(2026, 0, 1)), sample)
    const dayN = dailyQuote(new Date(Date.UTC(2026, 0, 1 + sample.length)), sample)
    expect(dayN).toEqual(day0)
  })

  it('handles the real bundled set without error', () => {
    const q = dailyQuote(new Date('2026-06-28T00:00:00Z'))
    expect(q).toHaveLength(2)
    expect(QUOTES).toContainEqual(q)
  })

  it('falls back gracefully on an empty set', () => {
    expect(dailyQuote(new Date(), [])).toEqual(['Begin anywhere.', 'John Cage'])
  })
})
