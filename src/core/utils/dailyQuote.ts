// dailyQuote — pick one quote per calendar day, deterministically, with no
// repeat until the whole set has been shown.
//
// Pure and time-injected (the caller passes the date), so it is trivially
// testable and never reads the clock itself. The selection is a fixed,
// seed-shuffled permutation of the set indexed by the day number: same day ->
// same quote, and the first N days walk every quote exactly once before the
// cycle restarts. Changing the quote list length adapts automatically.

import { QUOTES, type Quote } from '@/core/data/quotes'

// Deterministic PRNG (mulberry32) — a tiny, well-distributed generator so the
// shuffle is stable across runs/builds without pulling in a dependency.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A fixed seed keeps the day->quote mapping identical forever; bump it only if
// you ever want to deliberately re-roll the order.
const SHUFFLE_SEED = 0x1f2e3d4c

// One stable permutation of [0..n), computed once per length via seeded
// Fisher–Yates. Cached so repeated calls in a session don't reshuffle.
let cachedOrder: number[] | null = null
let cachedFor = -1
function permutation(n: number): number[] {
  if (cachedOrder && cachedFor === n) return cachedOrder
  const rand = mulberry32(SHUFFLE_SEED)
  const order = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  cachedOrder = order
  cachedFor = n
  return order
}

// Whole-day index from a date, in UTC so the result doesn't shift with the
// runner's timezone — what matters is "which day", uniformly.
function dayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      86_400_000,
  )
}

/**
 * The quote for the given day. No repeats until all quotes have been shown.
 * Falls back to a constant entry only if the set is somehow empty.
 */
export function dailyQuote(date: Date, quotes: readonly Quote[] = QUOTES): Quote {
  const n = quotes.length
  if (n === 0) return ['Begin anywhere.', 'John Cage']
  const order = permutation(n)
  // Non-negative modulo so dates before the epoch still map cleanly.
  const idx = ((dayNumber(date) % n) + n) % n
  return quotes[order[idx]]
}
