// services/ai/MockAI.ts — the development stand-in for a real AI provider.
//
// Phase 5 deliberately ships NO network call (the API-key strategy waits for the
// Phase 6 edge proxy). MockAI lets the whole slice run end-to-end NOW: it
// implements the same AIProvider contract a real Anthropic provider will, and
// returns text in the EXACT format engine/ai/prompts/milestones asks for, so
// engine/ai/parsers/milestones consumes it unchanged. When the real provider
// lands, services/ai/index.ts swaps the export and nothing else moves.
//
// Output is deterministic and derived from the request (it personalises the
// checkpoints with the subgoal title it finds in the prompt), so a developer
// sees plausible, varying suggestions without any key or network.

import type { AIProvider } from '@/services/ai/AIProvider'
import type { AIRequest, AIResponse } from '@/engine/ai/types'

// Phase templates a subgoal is broken into. Generic on purpose — the mock is a
// scaffold, not a planner; the real model produces context-specific milestones.
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

export class MockAI implements AIProvider {
  complete(request: AIRequest): Promise<AIResponse> {
    const subject = extractSubgoalTitle(request) ?? 'this subgoal'
    const suggestions = MILESTONE_TEMPLATES.map((template) => ({
      title: template.title,
      // Mention the subgoal so the output visibly responds to the input — this
      // is what makes the mock feel like a real suggestion during development.
      description: `${template.description} (toward ${subject})`,
    }))
    // Resolve async to mirror the real provider's Promise-based shape; no
    // artificial delay so tests stay fast.
    return Promise.resolve({ text: JSON.stringify(suggestions) })
  }
}

// Best-effort pull of the subgoal title out of the request, matching the
// "Subgoal: X" line buildMilestonePrompt writes. Returns null if absent so the
// caller can fall back — the mock must never throw on an unexpected prompt shape.
function extractSubgoalTitle(request: AIRequest): string | null {
  for (const message of request.messages) {
    const match = message.content.match(/^Subgoal:\s*(.+)$/m)
    if (match) return match[1].trim()
  }
  return null
}
