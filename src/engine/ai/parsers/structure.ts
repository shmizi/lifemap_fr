// engine/ai/parsers/structure.ts — turn a model's raw text into a validated,
// typed plan structure: tracks, each carrying its ordered phases (Phase 10,
// Stage 2). The counterpart of prompts/structure.ts.
//
// PURE and NEVER throws (same contract as parseSuggestionList): a model can return
// prose, fences, truncated JSON, or nonsense, and every one yields [] — a create
// flow degrades to "no structure" (the user builds it manually) rather than
// crashing. Reuses the shared extractJsonArray primitive; nesting (phases inside a
// track) is the only thing this adds over the flat suggestion parser.

import type {
  AIResponse,
  PlannedPhase,
  PlannedTrack,
} from '@/engine/ai/types'
import { extractJsonArray } from '@/engine/ai/parsers/suggestionList'
import {
  MAX_STRUCTURE_TRACKS,
  MAX_PHASES_PER_TRACK,
} from '@/engine/ai/prompts/structure'

export function parseStructure(response: AIResponse): PlannedTrack[] {
  const parsed = extractJsonArray(response.text)
  if (parsed === null) return []

  const tracks: PlannedTrack[] = []
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const record = item as Record<string, unknown>

    const title = readTitle(record.title)
    if (title === undefined) continue

    const description = readDescription(record.description)
    const phases = readPhases(record.phases)

    const track: PlannedTrack = { title, phases }
    if (description) track.description = description
    tracks.push(track)
    if (tracks.length >= MAX_STRUCTURE_TRACKS) break
  }
  return tracks
}

// The ordered phases of one track. A missing / non-array / empty `phases` yields
// [] — a bare track (subgoal with no milestones yet) is valid. Each phase needs a
// non-blank title; the list is capped defensively.
function readPhases(value: unknown): PlannedPhase[] {
  if (!Array.isArray(value)) return []
  const phases: PlannedPhase[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const title = readTitle(record.title)
    if (title === undefined) continue
    const description = readDescription(record.description)
    phases.push(description ? { title, description } : { title })
    if (phases.length >= MAX_PHASES_PER_TRACK) break
  }
  return phases
}

// A non-blank trimmed title, or undefined when absent/blank/not-a-string.
function readTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

// A non-blank trimmed description, or undefined (optional field).
function readDescription(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}
