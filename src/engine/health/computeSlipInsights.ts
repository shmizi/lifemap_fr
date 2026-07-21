// computeSlipInsights — find the dominant REASON behind recent slips and say what
// to do about it (Stage 3 of the health model).
//
// PURE TypeScript: no React, no DB, no store. Time is injected as `now`.
//
// Stage 2's insights read the slip COUNTS; this reads the slip REASONS (the event
// log), so it can say not just "you keep slipping" but WHY and therefore what to
// change. It looks at a recent window (default 30 days — this is why the event log
// carries timestamps), and only speaks when there's a real pattern: enough events,
// and one reason clearly dominating. Otherwise it stays quiet rather than
// over-reading noise. `unspecified` reasons (skipped prompts) are ignored.

import { parseISO, subDays } from 'date-fns'
import type { SlipEvent, SlipReason } from '@/core/types'

type NamedReason = Exclude<SlipReason, 'unspecified'>

export interface SlipPattern {
  reason: NamedReason
  count: number // events of the dominant reason in the window
  total: number // reasoned events in the window (excludes 'unspecified')
  share: number // count / total, 0..1
  windowDays: number
  text: string // the interpreted suggestion
}

// Too few events is noise, not a pattern — stay quiet below this.
const MIN_EVENTS = 3
// The dominant reason must be at least this share of reasoned slips to call it.
const DOMINANT_SHARE = 0.5

// Per-reason phrasing: how to name the pattern, and what to do about it.
const ADVICE: Record<NamedReason, { phrase: string; suggestion: string }> = {
  higher_priority: {
    phrase: 'higher-priority work bumping this aside',
    suggestion:
      'Protect a fixed slot for this goal, or trim what keeps competing with it.',
  },
  no_time: {
    phrase: 'simply running out of time',
    suggestion:
      'Try cutting your weekly load by ~20% so the plan fits your real capacity.',
  },
  not_motivated: {
    phrase: 'low motivation',
    suggestion:
      'Schedule these at your best time of day and shrink the first step so starting is easy.',
  },
  dependency: {
    phrase: 'waiting on prerequisites',
    suggestion:
      'Finish prerequisite milestones before scheduling work that depends on them.',
  },
  external: {
    phrase: 'external blockers',
    suggestion:
      "Build in buffer and avoid scheduling tightly around things you can't control.",
  },
}

export function computeSlipInsights(
  events: SlipEvent[],
  now: Date,
  windowDays: number = 30,
): SlipPattern | null {
  const cutoff = subDays(now, windowDays)

  // Recent, reasoned slips only.
  const counts = new Map<NamedReason, number>()
  let total = 0
  for (const e of events) {
    if (e.reason === 'unspecified') continue
    if (parseISO(e.at) < cutoff) continue
    counts.set(e.reason, (counts.get(e.reason) ?? 0) + 1)
    total++
  }

  if (total < MIN_EVENTS) return null

  // The dominant reason.
  let reason: NamedReason | null = null
  let count = 0
  for (const [r, c] of counts) {
    if (c > count) {
      reason = r
      count = c
    }
  }
  if (reason === null) return null

  const share = count / total
  if (share < DOMINANT_SHARE) return null // no clear pattern

  const pct = Math.round(share * 100)
  const { phrase, suggestion } = ADVICE[reason]
  return {
    reason,
    count,
    total,
    share,
    windowDays,
    text: `${pct}% of your recent delays (${count} of ${total}) are ${phrase}. ${suggestion}`,
  }
}
