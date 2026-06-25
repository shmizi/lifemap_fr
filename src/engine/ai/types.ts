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

import type { ID, ISODate } from '@/core/types'

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

// ── Suggestions (shared) ─────────────────────────────────────────────────────
// One AI-suggested item the user accepts / edits / rejects: a title plus an
// optional one-line description. The milestone and subgoal suggestion features
// share this exact shape, so each aliases it (below) to read in its own
// vocabulary — the same shared-primitive + domain-alias pattern as Completion
// underlying GoalProgress/SubgoalProgress in engine/progress. The matching
// parser primitive is engine/ai/parsers/suggestionList.ts.
export interface AISuggestion {
  title: string
  description?: string
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

// A suggested checkpoint. The store supplies id/order/status/aiSuggested when an
// accepted suggestion is written through the existing addMilestone path.
export type MilestoneSuggestion = AISuggestion

// ── Feature: subgoal suggestions ─────────────────────────────────────────────
// The major parts a GOAL breaks into — suggested when the goal is created. Same
// accept/edit/reject flow as milestones, one level up the hierarchy. Accepted
// suggestions are written through the existing addSubgoal path.

// Everything the prompt builder needs to describe ONE goal to the model.
export interface SubgoalSuggestionContext {
  goalTitle: string
  goalDescription: string
  // Human-readable category label (e.g. "Education") — light steer for the kind
  // of parts a goal of this sort tends to need.
  goalCategory: string
  // Titles of subgoals the goal already has, so the model avoids duplicates.
  existingSubgoalTitles?: string[]
}

export type SubgoalSuggestion = AISuggestion

// ── Feature: daily plan (consistency subgoals) ───────────────────────────────
// For a subgoal marked requiresConsistency, generate a short ordered run of
// daily practice sessions. The model returns the sessions (AISuggestion shape);
// the pure scheduleDailyTasks function turns them into dated tasks.

// What the UI hands the store to (re)generate a daily plan. The store turns this
// into a DailyPlanContext by deriving `days` (and the start date) from the
// subgoal's existing scheduled tasks + deadline via computePlanWindow — so a
// re-run extends the plan instead of overlapping it. The UI does NOT compute the
// window itself (it can't see the existing tasks cheaply, and the math is the
// engine's job).
export interface DailyPlanRequest {
  subgoalId: ID
  subgoalTitle: string
  subgoalDescription: string
  goalTitle: string
  // Minutes per session (the subgoal's estimatedDailyMinutes).
  dailyMinutes: number
  // The subgoal's deadline, if any — bounds how far the plan may extend.
  targetDate?: ISODate
}

// Everything the prompt builder needs to describe the daily-plan request. `days`
// is the already-resolved window length (the store fills it from computePlanWindow).
export interface DailyPlanContext {
  subgoalTitle: string
  subgoalDescription: string
  goalTitle: string
  // Minutes per session (the subgoal's estimatedDailyMinutes).
  dailyMinutes: number
  // How many days to plan (bounded by the store: horizon, narrowed to the days
  // remaining from the start date to any deadline).
  days: number
}

// One scheduled daily task, ready for the existing addTask path. scheduledDate is
// a date-only YYYY-MM-DD local key (same convention the dashboard windows use);
// estimatedMinutes is the subgoal's per-day estimate (this is the long-reserved
// Task.estimatedMinutes field finally used, for AI scheduling as intended).
export interface ScheduledDailyTask {
  title: string
  description?: string
  scheduledDate: ISODate
  estimatedMinutes: number
}
