import { describe, it, expect } from 'vitest'
import { buildScopeCutPrompt } from '@/engine/ai/prompts/scopeCut'
import type { ScopeCutContext } from '@/engine/ai/types'

const base: ScopeCutContext = {
  goalId: 'goal-1',
  goalTitle: 'Ship the mobile app',
  goalDescription: 'A cross-platform release.',
  goalCategory: 'Career',
  targetDate: '2026-09-01',
  behindSummary: 'At the current pace, projected to finish ~3 weeks late.',
}

const userText = (ctx: ScopeCutContext): string =>
  buildScopeCutPrompt(ctx).messages[0].content

describe('buildScopeCutPrompt', () => {
  it('produces a system instruction plus a single user message', () => {
    const request = buildScopeCutPrompt(base)
    expect(request.system.length).toBeGreaterThan(0)
    expect(request.messages).toHaveLength(1)
    expect(request.messages[0].role).toBe('user')
  })

  it('frames the ask as trimming scope against a hard deadline', () => {
    const system = buildScopeCutPrompt(base).system
    expect(system).toContain('HARD deadline')
    expect(system).toContain('TRIM SCOPE')
    // The three actions must be offered.
    expect(system).toContain('cut')
    expect(system).toContain('compress')
    expect(system).toContain('defer')
  })

  it('asks for a JSON object with summary + suggestions', () => {
    const system = buildScopeCutPrompt(base).system
    expect(system).toContain('JSON object')
    expect(system).toContain('summary')
    expect(system).toContain('suggestions')
  })

  it('carries the goal, deadline, and behind-status into the message', () => {
    const text = userText(base)
    expect(text).toContain('Ship the mobile app')
    expect(text).toContain('2026-09-01')
    expect(text).toContain('projected to finish ~3 weeks late')
  })

  it('uses the quality tier for this Direction-level judgement', () => {
    expect(buildScopeCutPrompt(base).tier).toBe('quality')
  })
})
