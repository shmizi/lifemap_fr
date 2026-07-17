import { describe, it, expect } from 'vitest'
import {
  parsePlannedSessions,
  MIN_SESSION_MINUTES,
  MAX_SESSION_MINUTES,
  MAX_RECURRENCE_EVERY_DAYS,
} from '@/engine/ai/parsers/plannedSessions'

const asResponse = (text: string) => ({ text })

describe('parsePlannedSessions', () => {
  it('parses title, description, and model-decided minutes', () => {
    const sessions = parsePlannedSessions(
      asResponse(
        JSON.stringify([
          { title: 'Warm up', description: 'scales', minutes: 20 },
          { title: 'New tune', description: 'learn head', minutes: 45 },
        ]),
      ),
      10,
    )
    expect(sessions).toEqual([
      { title: 'Warm up', description: 'scales', minutes: 20 },
      { title: 'New tune', description: 'learn head', minutes: 45 },
    ])
  })

  it('leaves minutes undefined when absent (caller defaults it)', () => {
    const [s] = parsePlannedSessions(
      asResponse(JSON.stringify([{ title: 'No duration' }])),
      10,
    )
    expect(s).toEqual({ title: 'No duration' })
    expect('minutes' in s).toBe(false)
  })

  it('clamps out-of-range minutes to the defensive bounds', () => {
    const sessions = parsePlannedSessions(
      asResponse(
        JSON.stringify([
          { title: 'tiny', minutes: 1 },
          { title: 'huge', minutes: 100000 },
        ]),
      ),
      10,
    )
    expect(sessions[0].minutes).toBe(MIN_SESSION_MINUTES)
    expect(sessions[1].minutes).toBe(MAX_SESSION_MINUTES)
  })

  it('rounds and tolerates a numeric string; ignores non-numeric/<=0', () => {
    const sessions = parsePlannedSessions(
      asResponse(
        JSON.stringify([
          { title: 'a', minutes: 30.6 },
          { title: 'b', minutes: '25' },
          { title: 'c', minutes: 'soon' },
          { title: 'd', minutes: 0 },
          { title: 'e', minutes: -10 },
        ]),
      ),
      10,
    )
    expect(sessions[0].minutes).toBe(31)
    expect(sessions[1].minutes).toBe(25)
    expect('minutes' in sessions[2]).toBe(false)
    expect('minutes' in sessions[3]).toBe(false)
    expect('minutes' in sessions[4]).toBe(false)
  })

  it('drops titleless entries, caps at max, and tolerates fences/prose', () => {
    expect(
      parsePlannedSessions(
        asResponse('```json\n[{"title":"ok","minutes":30},{"minutes":10}]\n```'),
        10,
      ),
    ).toEqual([{ title: 'ok', minutes: 30 }])

    const many = Array.from({ length: 8 }, (_, i) => ({ title: `t${i}` }))
    expect(parsePlannedSessions(asResponse(JSON.stringify(many)), 3)).toHaveLength(3)
  })

  it('returns [] for unparseable text (never throws)', () => {
    expect(parsePlannedSessions(asResponse('no json here'), 10)).toEqual([])
    expect(parsePlannedSessions(asResponse('[broken'), 10)).toEqual([])
  })

  it('reads a recurrence interval, clamps it, and ignores garbage', () => {
    const sessions = parsePlannedSessions(
      asResponse(
        JSON.stringify([
          { title: 'weekly review', recurrence: { everyDays: 7 } },
          { title: 'too big', recurrence: { everyDays: 999 } },
          { title: 'zero', recurrence: { everyDays: 0 } },
          { title: 'not an object', recurrence: 'weekly' },
          { title: 'one-time' },
        ]),
      ),
      10,
    )
    expect(sessions[0].recurrence).toEqual({ everyDays: 7 })
    expect(sessions[1].recurrence).toEqual({ everyDays: MAX_RECURRENCE_EVERY_DAYS })
    expect('recurrence' in sessions[2]).toBe(false)
    expect('recurrence' in sessions[3]).toBe(false)
    expect('recurrence' in sessions[4]).toBe(false)
  })
})
