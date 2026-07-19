import { describe, it, expect } from 'vitest'
import { buildStructurePrompt } from '@/engine/ai/prompts/structure'
import type { StructureContext } from '@/engine/ai/types'

const userText = (ctx: StructureContext): string =>
  buildStructurePrompt(ctx).messages[0].content

const base: StructureContext = {
  goalId: 'goal-1',
  goalTitle: 'Get into RWTH Aachen',
  goalDescription: 'Admission to the CS masters programme.',
  goalCategory: 'Education',
}

describe('buildStructurePrompt', () => {
  it('produces a system instruction plus a single user message', () => {
    const request = buildStructurePrompt(base)
    expect(request.system.length).toBeGreaterThan(0)
    expect(request.messages).toHaveLength(1)
    expect(request.messages[0].role).toBe('user')
  })

  it('carries the goal title, category, and description into the message', () => {
    const text = userText(base)
    expect(text).toContain('Get into RWTH Aachen')
    expect(text).toContain('Education')
    expect(text).toContain('Admission to the CS masters programme.')
  })

  it('includes the target date when present', () => {
    expect(userText({ ...base, targetDate: '2027-03-01' })).toContain(
      '2027-03-01',
    )
  })

  it('asks for a nested JSON array of tracks with phases', () => {
    const system = buildStructurePrompt(base).system
    expect(system).toContain('JSON array')
    expect(system).toContain('phases')
  })

  it('names both tracks and phases as the two structure levels', () => {
    const system = buildStructurePrompt(base).system
    expect(system).toContain('track')
    expect(system).toContain('phase')
  })

  it('tells the model to leave the skeleton undated (no day-to-day tasks)', () => {
    // Guards the Stage-2/Stage-3 split: structure must not schedule or date work.
    const system = buildStructurePrompt(base).system.toLowerCase()
    expect(system).toContain('undated')
  })

  it('uses the quality tier for this nuanced decomposition', () => {
    expect(buildStructurePrompt(base).tier).toBe('quality')
  })
})
