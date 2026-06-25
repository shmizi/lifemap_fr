// engine/ai/types.ts — the shared vocabulary of the AI layer (Phase 5).
//
// PURE TypeScript: no React, no DB, no store, NO fetch. These are data shapes
// only. Two kinds live here, deliberately together:
//
//   1. Provider-agnostic TRANSPORT shapes (AIRequest / AIResponse). A prompt
//      builder PRODUCES an AIRequest; a provider CONSUMES it and returns an
//      AIResponse; a parser CONSUMES that. The engine owns these — NOT
//      services/ — so the pure engine never imports the service layer (that
//      would invert the dependency: services depends on engine, never the
//      reverse). services/ai/AIProvider.ts imports AIRequest/AIResponse FROM
//      here to type its interface.
//
//   2. The first FEATURE's domain shapes (milestone suggestions). Each future
//      AI feature adds its own domain types beside these; the transport shapes
//      are shared by all of them.
//
// WHY a single tiny transport shape instead of leaking Anthropic's request
// format everywhere: the rest of the app must not know which provider answers.
// A provider swap (MockAI -> Anthropic in Phase 6) changes ONE service file and
// nothing here, in the prompts, the parsers, or the store.

// ── Provider-agnostic transport ──────────────────────────────────────────────

export type AIRole = 'user' | 'assistant'

export interface AIMessage {
  role: AIRole
  content: string
}

// What every prompt builder returns and every provider accepts. Intentionally
// minimal — system instruction + the conversation turns + an advisory output
// cap. `maxTokens` is a hint a provider MAY honour, not a guarantee the engine
// enforces; the mock ignores it, a real provider passes it through.
export interface AIRequest {
  system: string
  messages: AIMessage[]
  maxTokens?: number
}

// What every provider returns. Just the model's raw text — turning that text
// into typed, validated domain data is a PARSER's job (engine/ai/parsers/*),
// never the provider's. Keeping the provider dumb is what lets MockAI and a real
// model be interchangeable.
export interface AIResponse {
  text: string
}

// ── Feature: milestone suggestions ───────────────────────────────────────────
// The first AI slice: when a subgoal is created, suggest a few milestone
// checkpoints the user can accept / edit / reject (see STRICT DATA HIERARCHY).

// Everything the prompt builder needs to describe ONE subgoal to the model.
// Plain strings, NOT the Subgoal/Goal entities — so the pure builder stays
// decoupled from persistence shapes and is trivial to unit-test on fixtures.
// The store assembles this from the loaded goal tree it already holds.
export interface MilestoneSuggestionContext {
  subgoalTitle: string
  subgoalDescription: string
  goalTitle: string
  // Titles of milestones the subgoal already has, so the model can avoid
  // proposing duplicates. Optional / may be empty for a fresh subgoal.
  existingMilestoneTitles?: string[]
}

// One suggested checkpoint. Shape mirrors the slice of Milestone the user edits
// (title + optional description); the store supplies id/order/status/aiSuggested
// when an accepted suggestion is written through the existing addMilestone path.
export interface MilestoneSuggestion {
  title: string
  description?: string
}
