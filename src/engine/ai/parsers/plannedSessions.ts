// engine/ai/parsers/plannedSessions.ts — parse a daily plan whose sessions carry a
// model-decided duration (Phase 10 scheduler).
//
// PURE and NEVER throws (same contract as parseSuggestionList), reusing the shared
// extractJsonArray primitive. Each element must have a non-blank title; description
// is optional; `minutes` is read ONLY when the model gives a sane positive number,
// clamped to a defensive range — otherwise it is left undefined so the caller
// applies its own default (DEFAULT_DAILY_MINUTES). Keeping minutes optional here
// (not defaulted) means a missing or garbage value never silently becomes a
// misleading concrete duration; the schedule/pack step owns that fallback.

import type {
  AIResponse,
  PlannedSession,
  SessionRecurrence,
} from '@/engine/ai/types'
import { extractJsonArray } from '@/engine/ai/parsers/suggestionList'

// Defensive bounds on a model-supplied minute estimate: a session shorter than a
// few minutes or longer than a very long block is almost certainly a mistake.
// Exported so tests and callers share the range.
export const MIN_SESSION_MINUTES = 5
export const MAX_SESSION_MINUTES = 480

// A recurring interval below a day makes no sense; above ~a month is not a "daily
// plan" habit. Clamp a model-supplied everyDays into this range.
export const MAX_RECURRENCE_EVERY_DAYS = 30

export function parsePlannedSessions(
  response: AIResponse,
  max: number,
): PlannedSession[] {
  const parsed = extractJsonArray(response.text)
  if (parsed === null) return []

  const out: PlannedSession[] = []
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const record = item as Record<string, unknown>

    const title = typeof record.title === 'string' ? record.title.trim() : ''
    if (title.length === 0) continue

    const rawDescription = record.description
    const description =
      typeof rawDescription === 'string' && rawDescription.trim().length > 0
        ? rawDescription.trim()
        : undefined

    const minutes = readMinutes(record.minutes)
    const recurrence = readRecurrence(record.recurrence)

    const session: PlannedSession = { title }
    if (description) session.description = description
    if (minutes !== undefined) session.minutes = minutes
    if (recurrence) session.recurrence = recurrence
    out.push(session)
    if (out.length >= max) break
  }
  return out
}

// A recurrence object with a sane positive everyDays, clamped to the range; any
// other shape (missing, not an object, non-numeric/<=0 everyDays) yields undefined,
// so the session is treated as a one-time progression task.
function readRecurrence(value: unknown): SessionRecurrence | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }
  const record = value as Record<string, unknown>
  const raw =
    typeof record.everyDays === 'number'
      ? record.everyDays
      : Number(record.everyDays)
  if (!Number.isFinite(raw) || raw <= 0) return undefined
  return {
    everyDays: Math.min(MAX_RECURRENCE_EVERY_DAYS, Math.max(1, Math.round(raw))),
  }
}

// A positive finite number, rounded and clamped to the defensive range; anything
// else (missing, non-numeric string, NaN, <= 0) yields undefined so the caller
// defaults it. Tolerant of a numeric string like "30" (a common model quirk).
function readMinutes(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.min(MAX_SESSION_MINUTES, Math.max(MIN_SESSION_MINUTES, Math.round(n)))
}
