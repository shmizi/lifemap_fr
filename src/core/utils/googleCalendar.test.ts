import { describe, it, expect } from 'vitest'
import { googleCalendarUrl } from '@/core/utils/googleCalendar'

describe('googleCalendarUrl', () => {
  it('builds a TEMPLATE url with title and a timed range on the given day', () => {
    const url = googleCalendarUrl({ title: 'Revise Graphs', date: '2026-07-01' })
    expect(url.startsWith('https://calendar.google.com/calendar/render?')).toBe(
      true,
    )
    expect(url).toContain('action=TEMPLATE')
    // default 09:00 for 30 min
    expect(url).toContain('dates=20260701T090000%2F20260701T093000')
    expect(url).toContain('text=Revise+Graphs')
  })

  it('uses the duration when given', () => {
    const url = googleCalendarUrl({
      title: 'Study',
      date: '2026-07-01',
      durationMinutes: 80,
    })
    expect(url).toContain('20260701T090000%2F20260701T102000')
  })

  it('includes details when provided and omits them otherwise', () => {
    expect(
      googleCalendarUrl({ title: 'X', date: '2026-07-01', details: 'do the thing' }),
    ).toContain('details=do+the+thing')
    expect(
      googleCalendarUrl({ title: 'X', date: '2026-07-01' }),
    ).not.toContain('details=')
  })

  it('clamps an over-long block to the end of the day', () => {
    const url = googleCalendarUrl({
      title: 'X',
      date: '2026-07-01',
      durationMinutes: 100000,
    })
    expect(url).toContain('20260701T235900')
  })
})
