import { describe, it, expect } from 'vitest'
import {
  buildStrategyBriefPrompt,
  renderStrategyBriefLines,
  MAX_BRIEF_PRIORITIES,
} from '@/engine/ai/prompts/strategyBrief'
import type { StrategyBrief } from '@/engine/ai/types'

describe('buildStrategyBriefPrompt', () => {
  it('carries the goal, category, and asks for the JSON-object contract', () => {
    const req = buildStrategyBriefPrompt({
      goalId: 'g1',
      goalTitle: 'Get into a top robotics grad school',
      goalDescription: 'Two years to build the profile',
      goalCategory: 'Education',
      targetDate: '2028-08-01',
    })
    const text = req.messages[0].content
    expect(text).toContain('Get into a top robotics grad school')
    expect(text).toContain('Education')
    expect(text).toContain('Two years to build the profile')
    expect(text).toContain('2028-08-01')
    // Output contract lives in the system instruction.
    expect(req.system).toContain('sharpenedTarget')
    expect(req.system).toContain('priorities')
  })

  it('reasons at the quality tier (this is the nuanced Direction step)', () => {
    expect(
      buildStrategyBriefPrompt({
        goalId: 'g1',
        goalTitle: 'X',
        goalDescription: '',
        goalCategory: 'Education',
      }).tier,
    ).toBe('quality')
  })

  it('splices user + goal context but keeps no MockAI branch markers', () => {
    const text = buildStrategyBriefPrompt({
      goalId: 'g1',
      goalTitle: 'X',
      goalDescription: '',
      goalCategory: 'Education',
      userContext: { situation: 'Student', availableHoursPerDay: 3 },
      goalContext: { deadlineHardness: 'hard', startingLevel: 'beginner' },
    }).messages[0].content
    expect(text).toContain('About the person')
    expect(text).toContain('HARD')
    expect(text).toContain('beginner')
    // No "Subgoal:" / "Days to plan:" lines introduced by context.
    expect(text.split('\n').some((l) => l.startsWith('Subgoal:'))).toBe(false)
    expect(text.split('\n').some((l) => l.startsWith('Days to plan:'))).toBe(false)
  })

  it('renders the intake conversation as Q/A lines when present', () => {
    const text = buildStrategyBriefPrompt({
      goalId: 'g1',
      goalTitle: 'X',
      goalDescription: '',
      goalCategory: 'Education',
      intake: [
        { question: 'Which countries?', answer: 'Any strong university' },
        { question: 'Budget?', answer: 'Prefer a scholarship' },
      ],
    }).messages[0].content
    expect(text).toContain('Intake conversation:')
    expect(text).toContain('Q: Which countries?')
    expect(text).toContain('A: Any strong university')
    expect(text).toContain('Q: Budget?')
  })

  it('omits the intake block entirely when there is none', () => {
    const text = buildStrategyBriefPrompt({
      goalId: 'g1',
      goalTitle: 'X',
      goalDescription: '',
      goalCategory: 'Education',
    }).messages[0].content
    expect(text).not.toContain('Intake conversation:')
  })
})

describe('renderStrategyBriefLines', () => {
  const brief: StrategyBrief = {
    sharpenedTarget: 'By 2028, be competitive for the best robotics grad schools',
    theme: 'Intelligent Autonomous Systems',
    priorities: [
      { title: 'Master DSA fundamentals', rationale: 'Highest ROI: gates internships + research' },
      { title: 'Build robotics credibility', rationale: '' },
    ],
    notes: ['Keep GATE and GRE both open', 'ROI matters — prefer scholarships'],
  }

  it('returns [] for an absent brief', () => {
    expect(renderStrategyBriefLines()).toEqual([])
    expect(renderStrategyBriefLines(undefined)).toEqual([])
  })

  it('renders target, theme, ranked priorities, and notes', () => {
    const text = renderStrategyBriefLines(brief).join('\n')
    expect(text).toContain('Strategy — target: By 2028')
    expect(text).toContain('Strategy — theme: Intelligent Autonomous Systems')
    expect(text).toContain('1. Master DSA fundamentals — Highest ROI')
    // A blank rationale renders the title alone, still numbered.
    expect(text).toContain('2. Build robotics credibility')
    expect(text).toContain('Strategy — note: Keep GATE and GRE both open')
  })

  it('never emits a line that collides with a MockAI branch marker', () => {
    for (const line of renderStrategyBriefLines(brief)) {
      expect(/^(Goal|Subgoal|Query|Days to plan):/.test(line)).toBe(false)
    }
  })

  it('numbers only the priorities that survive (skips blank titles)', () => {
    const lines = renderStrategyBriefLines({
      sharpenedTarget: 'T',
      theme: '',
      priorities: [
        { title: '', rationale: 'dropped' },
        { title: 'Kept', rationale: '' },
      ],
      notes: [],
    })
    expect(lines.some((l) => l === '1. Kept')).toBe(true)
    expect(lines.some((l) => l.startsWith('2.'))).toBe(false)
  })

  it('keeps the shared priority cap small', () => {
    expect(MAX_BRIEF_PRIORITIES).toBeLessThanOrEqual(6)
  })
})
