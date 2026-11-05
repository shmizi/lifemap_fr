import { describe, it, expect } from 'vitest'
import { MAX_DIGEST_CHARS, parseDocumentDigest } from './documentDigest'

const res = (text: string) => ({ text })

describe('parseDocumentDigest', () => {
  it('returns the distillate as written', () => {
    expect(parseDocumentDigest(res('Required: linear algebra.\nDeadline: 12 Dec.')))
      .toBe('Required: linear algebra.\nDeadline: 12 Dec.')
  })

  it('unwraps a fenced code block a model may add anyway', () => {
    expect(parseDocumentDigest(res('```\nRequired: stats\n```'))).toBe(
      'Required: stats',
    )
  })

  it('strips a leading label', () => {
    expect(parseDocumentDigest(res('Summary: Required: stats'))).toBe(
      'Required: stats',
    )
  })

  it('returns null for the NOTHING_RELEVANT sentinel', () => {
    expect(parseDocumentDigest(res('NOTHING_RELEVANT'))).toBeNull()
    expect(parseDocumentDigest(res('  nothing_relevant  '))).toBeNull()
  })

  it('KEEPS a digest that merely mentions the sentinel', () => {
    // Only a bare sentinel means "nothing here" — the prompt allows no other form.
    const text = 'Constraint: mark NOTHING_RELEVANT items as optional.'
    expect(parseDocumentDigest(res(text))).toBe(text)
  })

  it('returns null for an empty or whitespace reply', () => {
    expect(parseDocumentDigest(res(''))).toBeNull()
    expect(parseDocumentDigest(res('   \n  '))).toBeNull()
  })

  it('never throws on a malformed reply', () => {
    expect(() => parseDocumentDigest(res('```json\n{{{'))).not.toThrow()
  })

  it('enforces the length ceiling the prompt only requests', () => {
    const long = 'x'.repeat(MAX_DIGEST_CHARS * 2)
    const out = parseDocumentDigest(res(long))
    expect(out).not.toBeNull()
    expect(out!.length).toBeLessThanOrEqual(MAX_DIGEST_CHARS)
  })

  it('prefers to trim an over-long reply at a line boundary', () => {
    const line = 'a'.repeat(200)
    const out = parseDocumentDigest(res(Array(30).fill(line).join('\n')))!
    // Cut on a newline, so the stored digest doesn't end mid-line.
    expect(out.endsWith('a')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(MAX_DIGEST_CHARS)
  })
})
