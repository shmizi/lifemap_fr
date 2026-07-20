// engine/planning/dedupeTasks.ts — provider-independent near-duplicate task
// detection. PURE TypeScript: no React, no DB, no store, no clock.
//
// WHY it exists: the AI generation prompt now tells the model not to repeat work
// across subgoals (DailyPlanContext.plannedElsewhere), but that only helps a REAL
// provider and never cleans plans already saved. This is the belt-and-suspenders:
// a string-similarity sweep that runs after generation (and on demand) to drop
// later copies of near-identical task TITLES, regardless of which provider made
// them. It catches LEXICAL near-duplicates (the model repeating near-verbatim);
// it does NOT catch semantic paraphrases that use different words — that stays the
// prompt's job. Conservative by default to keep false positives rare.

import type { ID } from '@/core/types'

export interface DedupTask {
  id: ID
  title: string
}

// Similarity at/above which two titles are treated as the same task. Deliberately
// high: we would rather miss a duplicate than delete a genuinely-distinct task.
export const DEDUP_THRESHOLD = 0.8

// Function words carry no task identity; dropping them keeps the token overlap
// focused on the content ("map professors" vs "mapping the professors").
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'for', 'your', 'you', 'my', 'at',
  'in', 'on', 'with', 'by', 'from', 'into', 'per', 'as', 'is', 'are', 'this',
  'that', 'it', 'each',
])

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 0 && !STOPWORDS.has(t)),
  )
}

// Token-set overlap — catches reordered/lightly-reworded titles ("Map AI faculty"
// vs "AI faculty mapping").
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Iterative Levenshtein (two rows, O(min·max) space) — no recursion, no deps.
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const curr = [i, ...new Array<number>(n).fill(0)]
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = curr
  }
  return prev[n]
}

// Normalized edit distance — catches near-verbatim repeats and typos.
function editSim(a: string, b: string): number {
  const max = Math.max(a.length, b.length)
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max
}

// Similarity in [0,1] combining both signals (whichever is stronger).
export function titleSimilarity(a: string, b: string): number {
  return Math.max(
    jaccard(tokenize(a), tokenize(b)),
    editSim(normalize(a), normalize(b)),
  )
}

// Given tasks in KEEP-PRIORITY order (earliest/most-canonical first), return the
// ids of later tasks whose title is near-identical (>= threshold) to one already
// kept. Keeps the first occurrence of each near-duplicate cluster; the caller
// deletes the returned ids. PURE — the caller owns ordering, deletion, and refresh.
export function findDuplicateTaskIds(
  tasks: DedupTask[],
  threshold: number = DEDUP_THRESHOLD,
): ID[] {
  const remove: ID[] = []
  const keptTitles: string[] = []
  for (const t of tasks) {
    const isDup = keptTitles.some((k) => titleSimilarity(k, t.title) >= threshold)
    if (isDup) remove.push(t.id)
    else keptTitles.push(t.title)
  }
  return remove
}
