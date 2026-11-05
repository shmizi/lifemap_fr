// parseDocumentDigest — turn the model's distillation into a storable summary.
//
// PURE and TOLERANT, like every parser in engine/ai/parsers: it NEVER throws. A
// malformed or empty reply yields null, which the caller treats as "no usable
// digest" — the document is simply not attached, rather than an error surfacing.
//
// This parser is also the real enforcement of the length budget. The prompt asks
// for one, but a prompt is a request, not a guarantee, and this string is rendered
// into every subsequent generation for the goal — so an over-long reply is trimmed
// here rather than trusted.

import type { AIResponse } from '@/engine/ai/types'

// Hard ceiling on the stored distillate, in characters. Generous against the
// prompt's ~250-word ask (which lands well under this), so trimming only catches a
// model that ignored the budget outright.
export const MAX_DIGEST_CHARS = 2000

// The sentinel the prompt specifies for "this document says nothing plannable".
const NOTHING = 'NOTHING_RELEVANT'

// Strip wrappers a model may add despite being asked not to: fenced code blocks,
// and a leading "Summary:"-style label.
function unwrap(raw: string): string {
  let text = raw.trim()
  const fenced = text.match(/^```(?:\w+)?\s*\n([\s\S]*?)\n?```$/)
  if (fenced) text = fenced[1].trim()
  return text.replace(/^(?:summary|digest|constraints)\s*:\s*/i, '').trim()
}

export function parseDocumentDigest(response: AIResponse): string | null {
  const text = unwrap(response.text ?? '')
  if (text.length === 0) return null
  // The model was told to say this when the document carries nothing plannable.
  // Compared case-insensitively against the whole reply so a bare sentinel — the
  // only form the prompt allows — is recognised, while a digest that merely
  // mentions the phrase is kept.
  if (text.toUpperCase() === NOTHING) return null

  if (text.length <= MAX_DIGEST_CHARS) return text
  // Trim at a line boundary where possible, so the stored digest doesn't end
  // mid-sentence; fall back to a hard cut when there is no break to use.
  const cut = text.slice(0, MAX_DIGEST_CHARS)
  const lastBreak = cut.lastIndexOf('\n')
  return (lastBreak > MAX_DIGEST_CHARS / 2 ? cut.slice(0, lastBreak) : cut).trim()
}
