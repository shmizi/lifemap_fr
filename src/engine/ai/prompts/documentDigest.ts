// buildDocumentDigestPrompt — distil an uploaded reference document ONCE.
//
// PURE: no fetch, no DB, no store, no clock. Same shape as every other builder in
// engine/ai/prompts — it returns an AIRequest and knows nothing about transport.
//
// WHY DISTIL AT ALL: the result is stored on the goal's context row, which is
// rendered into EVERY later generation (structure, subgoals, milestones, and each
// rolling daily plan and top-up). Carrying the raw document on that path would make
// every future call pay for it. So the expensive read happens exactly once, here,
// and everything downstream reads a short summary.
//
// The ask is deliberately extractive rather than interpretive: pull out what
// constrains the plan (requirements, sequence, dates, topics) and drop everything
// that doesn't — prose, boilerplate, marketing. What survives is what a planner
// would need to schedule around.

import type { AIRequest } from '@/engine/ai/types'

// Roughly how long the distillate may run. Stated to the model as a word budget
// (models honour those far better than character counts) and enforced again by the
// parser, which is the real guarantee.
export const DIGEST_WORD_BUDGET = 250

const SYSTEM = [
  'You condense a reference document into planning constraints.',
  'You are given a document a person attached to a personal goal — a syllabus, job description, training plan, course outline, or similar.',
  'Extract ONLY what would change how their plan is built: required topics or skills, prerequisites, the order things must happen in, fixed dates or deadlines, assessments or deliverables, and any explicit constraints.',
  'Ignore prose, introductions, marketing copy, contact details, and anything decorative.',
  `Answer in at most ${DIGEST_WORD_BUDGET} words, as short dense lines. No preamble, no closing remarks, no markdown headings.`,
  'If the document contains nothing that would shape a plan, reply with exactly: NOTHING_RELEVANT',
].join(' ')

export interface DocumentDigestContext {
  // The goal the document was attached to — so the distillation keeps what is
  // relevant to THIS goal rather than summarising the document in the abstract.
  goalTitle: string
  goalDescription?: string
  // The document's filename, which often carries real signal ("CS229-syllabus.md").
  documentName: string
  // The extracted text, already capped by readDocumentText.
  text: string
}

export function buildDocumentDigestPrompt(
  context: DocumentDigestContext,
): AIRequest {
  const lines: string[] = [`Goal: ${context.goalTitle}`]
  if (context.goalDescription && context.goalDescription.trim()) {
    lines.push(`Goal description: ${context.goalDescription.trim()}`)
  }
  lines.push(
    `Document filename: ${context.documentName}`,
    '',
    'Document:',
    context.text,
  )

  return {
    system: SYSTEM,
    messages: [{ role: 'user', content: lines.join('\n') }],
  }
}
