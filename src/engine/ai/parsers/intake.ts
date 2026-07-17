// engine/ai/parsers/intake.ts — turn a model's raw text into a validated list of
// intake QUESTION strings (Phase 10, Stage 0).
//
// PURE: no fetch, no DB, no store. Reuses the shared extractJsonArray primitive
// (parsers/suggestionList.ts). Like every parser it NEVER throws: prose, fences,
// truncated JSON, or the wrong element shape all degrade to [] (a calm "no
// questions — just generate from what we know"), never an exception.
//
// Tolerant on element shape: the contract asks for bare strings, but a model may
// wrap each as {"question": "..."}. Both are accepted so a minor format drift does
// not blank the interview.

import type { AIResponse } from '@/engine/ai/types'
import { extractJsonArray } from '@/engine/ai/parsers/suggestionList'

export function parseIntakeQuestions(response: AIResponse, max: number): string[] {
  const parsed = extractJsonArray(response.text)
  if (parsed === null) return []

  const questions: string[] = []
  for (const item of parsed) {
    let question = ''
    if (typeof item === 'string') {
      question = item.trim()
    } else if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>
      if (typeof record.question === 'string') question = record.question.trim()
    }
    if (question.length === 0) continue
    questions.push(question)
    if (questions.length >= max) break
  }
  return questions
}
