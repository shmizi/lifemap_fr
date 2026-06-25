// services/ai/MockAI.ts — the development stand-in for a real AI provider.
//
// Phase 5 deliberately ships NO network call (the API-key strategy waits for the
// Phase 6 edge proxy). MockAI lets the whole slice run end-to-end NOW: it
// implements the same AIProvider contract a real Anthropic provider will, and
// returns text in the EXACT format the engine/ai prompts ask for, so the shared
// parseSuggestionList primitive consumes it unchanged. When the real provider
// lands, services/ai/index.ts swaps the export and nothing else moves.
//
// It serves BOTH suggestion features off one request: a milestone prompt names a
// "Subgoal:" line, a subgoal prompt names only a "Goal:" line, so the mock reads
// the request to decide which templates to return and personalises them with the
// subject it finds. Output is deterministic — a developer sees plausible, varying
// suggestions without any key or network.

import type { AIProvider } from '@/services/ai/AIProvider'
import type { AIRequest, AIResponse } from '@/engine/ai/types'

// Generic checkpoint phases a SUBGOAL is broken into (milestone prompts).
const MILESTONE_TEMPLATES: ReadonlyArray<{ title: string; description: string }> =
  [
    {
      title: 'Lay the groundwork',
      description: 'Gather what you need and understand the starting point.',
    },
    {
      title: 'Build core competence',
      description: 'Reach a steady, working level of the main skill or output.',
    },
    {
      title: 'Practice under real conditions',
      description: 'Apply it to something realistic and find the weak spots.',
    },
    {
      title: 'Reach the target level',
      description: 'Close the remaining gap and confirm the subgoal is met.',
    },
  ]

// Generic major-part phases a GOAL is broken into (subgoal prompts). Distinct
// from the milestone templates so the two features are visibly different.
const SUBGOAL_TEMPLATES: ReadonlyArray<{ title: string; description: string }> =
  [
    {
      title: 'Establish the foundation',
      description: 'Build the base knowledge and setup everything else rests on.',
    },
    {
      title: 'Meet the key requirements',
      description: 'Satisfy the concrete prerequisites this goal demands.',
    },
    {
      title: 'Build supporting strengths',
      description: 'Develop the surrounding skills that make the goal achievable.',
    },
    {
      title: 'Make the final push',
      description: 'Bring the parts together and complete the goal.',
    },
  ]

export class MockAI implements AIProvider {
  complete(request: AIRequest): Promise<AIResponse> {
    // A daily-plan prompt is the only one with a "Days to plan:" line — check it
    // FIRST, because that prompt also carries a "Subgoal:" line (which would
    // otherwise look like a milestone request).
    const daysLine = extractLine(request, 'Days to plan')
    if (daysLine !== null) {
      return Promise.resolve({ text: this.dailyPlan(request, daysLine) })
    }

    // Otherwise: a milestone prompt describes a "Subgoal:"; a subgoal prompt
    // describes only a "Goal:". Branch on that for the right kind of items.
    const subgoal = extractLine(request, 'Subgoal')
    const templates = subgoal === null ? SUBGOAL_TEMPLATES : MILESTONE_TEMPLATES
    const subject = subgoal ?? extractLine(request, 'Goal') ?? 'this'

    const suggestions = templates.map((template) => ({
      title: template.title,
      // Mention the subject so the output visibly responds to the input — this
      // is what makes the mock feel like a real suggestion during development.
      description: `${template.description} (toward ${subject})`,
    }))
    // Resolve async to mirror the real provider's Promise-based shape; no
    // artificial delay so tests stay fast.
    return Promise.resolve({ text: JSON.stringify(suggestions) })
  }

  // Generate `days` ordered daily sessions (capped to the horizon), cycling a few
  // generic focuses and naming the subgoal so the output responds to the input.
  private dailyPlan(request: AIRequest, daysLine: string): string {
    const subject = extractLine(request, 'Subgoal') ?? 'this subgoal'
    const parsed = Number.parseInt(daysLine, 10)
    const days = Number.isFinite(parsed)
      ? Math.max(1, Math.min(parsed, DAILY_FOCUS_HORIZON))
      : 1
    const sessions = Array.from({ length: days }, (_, i) => ({
      title: `Day ${i + 1}: ${DAILY_FOCUSES[i % DAILY_FOCUSES.length]}`,
      description: `Spend today's session on ${subject}.`,
    }))
    return JSON.stringify(sessions)
  }
}

// Cycling session focuses for the mock daily plan, and a safety cap so a bad
// "Days to plan" value can never make the mock emit an unbounded list.
const DAILY_FOCUSES: ReadonlyArray<string> = [
  'Warm up and review',
  'Learn new material',
  'Practice actively',
  'Apply and self-test',
]
const DAILY_FOCUS_HORIZON = 14

// Best-effort pull of a "Label: value" line from the request, matching the lines
// the prompt builders write. Returns null if absent so the caller can branch /
// fall back — the mock must never throw on an unexpected prompt shape.
function extractLine(request: AIRequest, label: string): string | null {
  const pattern = new RegExp(`^${label}:\\s*(.+)$`, 'm')
  for (const message of request.messages) {
    const match = message.content.match(pattern)
    if (match) return match[1].trim()
  }
  return null
}
