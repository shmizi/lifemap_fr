// End-to-end for the reference-document feature.
//
// The point of the feature is not the upload — it is that an attached document
// reaches EVERY later generation for that goal while costing one call, not one per
// generation. So these tests follow the value all the way: attach a file, then
// assert the distillate is (a) what got persisted, (b) rendered into the prompt
// context the builders consume, and (c) that the raw text was never stored.

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import { getGoalContext } from '@/database/repositories'
import { renderGoalContextLines } from '@/engine/ai/prompts/system'
import { MAX_DOCUMENT_CHARS } from '@/core/utils/readDocumentText'
import { useContextStore } from './useContextStore'

const GOAL = { title: 'Learn linear algebra', description: 'For an ML course' }
const goalId = 'goal-1'

// jsdom's File.text() is available; build one from a string.
const fileOf = (name: string, body: string) =>
  new File([body], name, { type: 'text/plain' })

const SYLLABUS = `Course syllabus
Week 1: vectors and spans
Week 2: matrix multiplication
Assessment: midterm in week 6, final project week 12.`

beforeEach(async () => {
  await db.goalContext.clear()
})

describe('attachGoalDocument', () => {
  it('persists a distilled summary, not the raw document', async () => {
    const saved = await useContextStore
      .getState()
      .attachGoalDocument(goalId, fileOf('syllabus.md', SYLLABUS), GOAL)

    expect(saved).not.toBeNull()
    expect(saved!.name).toBe('syllabus.md')
    expect(saved!.originalChars).toBe(SYLLABUS.trim().length)

    const stored = await getGoalContext(goalId)
    expect(stored?.sourceDocument?.summary).toBe(saved!.summary)
    // The whole cost argument for the feature: the original text is never kept,
    // so it can never be re-sent on a later generation.
    expect(JSON.stringify(stored)).not.toContain('Week 2: matrix multiplication')
  })

  it('preserves other intake fields on the same row', async () => {
    await useContextStore.getState().saveGoalContext({
      goalId,
      deadlineHardness: 'hard',
      motivation: 'I want to understand ML properly',
    })

    await useContextStore
      .getState()
      .attachGoalDocument(goalId, fileOf('syllabus.md', SYLLABUS), GOAL)

    const stored = await getGoalContext(goalId)
    expect(stored?.motivation).toBe('I want to understand ML properly')
    expect(stored?.deadlineHardness).toBe('hard')
    expect(stored?.sourceDocument).toBeDefined()
  })

  it('rejects a file type it cannot decode, naming the workaround', async () => {
    await expect(
      useContextStore
        .getState()
        .attachGoalDocument(goalId, fileOf('spec.pdf', 'x'), GOAL),
    ).rejects.toThrow(/paste/i)
    expect((await getGoalContext(goalId))?.sourceDocument).toBeUndefined()
  })

  it('rejects an empty file', async () => {
    await expect(
      useContextStore
        .getState()
        .attachGoalDocument(goalId, fileOf('empty.txt', '   '), GOAL),
    ).rejects.toThrow(/empty/i)
  })

  it('truncates an enormous document rather than refusing it', async () => {
    const huge = 'Requirement line.\n'.repeat(40_000)
    const saved = await useContextStore
      .getState()
      .attachGoalDocument(goalId, fileOf('huge.txt', huge), GOAL)
    // originalChars records the true size even though only the head was read.
    expect(saved!.originalChars).toBeGreaterThan(MAX_DOCUMENT_CHARS)
    expect(saved).not.toBeNull()
  })

  it('clearGoalDocument detaches it and leaves the rest of the intake', async () => {
    await useContextStore.getState().saveGoalContext({
      goalId,
      deadlineHardness: 'soft',
      motivation: 'keep me',
    })
    await useContextStore
      .getState()
      .attachGoalDocument(goalId, fileOf('syllabus.md', SYLLABUS), GOAL)

    await useContextStore.getState().clearGoalDocument(goalId)

    const stored = await getGoalContext(goalId)
    expect(stored?.sourceDocument).toBeUndefined()
    expect(stored?.motivation).toBe('keep me')
  })
})

describe('the distillate reaches the prompts', () => {
  it('renders as an authoritative requirements line', () => {
    const lines = renderGoalContextLines({
      deadlineHardness: 'soft',
      documentSummary: 'Required: vectors, matrices. Midterm week 6.',
      documentName: 'syllabus.md',
    })
    const line = lines.find((l) => l.includes('Required: vectors'))
    expect(line).toBeDefined()
    expect(line).toContain('syllabus.md')
    expect(line).toContain('authoritative')
  })

  it('contributes nothing when no document is attached', () => {
    const lines = renderGoalContextLines({ deadlineHardness: 'soft' })
    expect(lines.some((l) => l.includes('reference document'))).toBe(false)
  })
})
