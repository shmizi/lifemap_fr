import { describe, it, expect, afterEach, vi } from 'vitest'
import { registryColophon } from '@/core/utils/colophon'

describe('registryColophon', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('derives the volume year from an ISODate string (local path)', () => {
    expect(registryColophon('2026-07-20T10:00:00.000Z')).toBe('Vol. 26 · Ed. 1')
  })

  it('accepts a full year as a number (signed-in path)', () => {
    expect(registryColophon(2027, 30)).toBe('Vol. 27 · Ed. 30')
  })

  it('defaults the edition to 1 when none is given', () => {
    expect(registryColophon(2031)).toBe('Vol. 31 · Ed. 1')
  })

  it('falls back to the current year when the join date is unknown', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2029-03-01T00:00:00.000Z'))
    expect(registryColophon(undefined)).toBe('Vol. 29 · Ed. 1')
  })
})
