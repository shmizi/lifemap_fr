// services/ai/AIProvider.ts — the contract every AI backend must satisfy.
//
// This is the seam the rest of the app talks to. The store depends on THIS
// interface, never on a concrete provider, so swapping MockAI for a real
// Anthropic-backed provider (Phase 6, behind an edge function) changes only
// which implementation services/ai/index.ts exports — no store, engine, prompt,
// or parser code moves.
//
// The transport types are owned by the PURE engine (engine/ai/types.ts), and
// imported here. That direction is deliberate: services depends on engine, never
// the reverse, so the prompt builders and parsers stay free of any service code.

import type { AIRequest, AIResponse } from '@/engine/ai/types'

export interface AIProvider {
  // Send one request (system + messages) and resolve to the model's raw text.
  // Implementations own transport concerns only — they do NOT parse the result
  // into domain data; that is a pure parser's job (engine/ai/parsers/*).
  // May reject on a transport failure (network/auth for a real provider); the
  // caller decides how to surface that.
  complete(request: AIRequest): Promise<AIResponse>
}
