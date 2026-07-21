// computeGoalInsights — turn the health signals into plain-language lines (Stage 2).
//
// PURE TypeScript: no React, no DB, no store, no clock. This is interpretation, not
// AI: it reads the already-computed signals and states, in a sentence, what they
// MEAN and what to do — "instead of 'Health: 78%', say why." It focuses on the
// RELIABILITY dimension (the new one), since Pace and Projection already narrate
// themselves on the card; it does not restate the projected-finish line.
//
// Returns insights ranked most-important first (the card shows the top one). Each
// carries a tone so the UI can colour it calmly — a nudge, never a siren.

import type { GoalHealthStatus } from '@/engine/health/computeGoalHealth'
import type { Reliability } from '@/engine/health/computeReliability'
import type { RiskLevel } from '@/engine/health/computeRisk'

export type InsightTone = 'positive' | 'caution' | 'warning'

export interface GoalInsight {
  text: string
  tone: InsightTone
}

export interface InsightInputs {
  progressPercent: number
  paceStatus: GoalHealthStatus
  reliability: Reliability
  riskLevel: RiskLevel
}

// A human list of the slips behind a low reliability, e.g. "3 reschedules, 1 late
// finish". Empty when nothing has slipped.
function slipSummary(r: Reliability): string {
  const parts: string[] = []
  if (r.reschedules > 0)
    parts.push(`${r.reschedules} reschedule${r.reschedules === 1 ? '' : 's'}`)
  if (r.lateCompletions > 0)
    parts.push(`${r.lateCompletions} late finish${r.lateCompletions === 1 ? '' : 'es'}`)
  if (r.openMisses > 0) parts.push(`${r.openMisses} still overdue`)
  return parts.join(', ')
}

export function computeGoalInsights(inputs: InsightInputs): GoalInsight[] {
  const { progressPercent, paceStatus, reliability, riskLevel } = inputs

  // Nothing to interpret yet.
  if (paceStatus === 'no_tasks' || reliability.status === 'no_history') return []

  const out: GoalInsight[] = []
  const slips = slipSummary(reliability)

  // 1. The headline when the blended risk is high.
  if (riskLevel === 'high') {
    out.push({
      tone: 'warning',
      text: slips
        ? `High risk of missing this goal — ${slips}. Consider trimming scope or lightening the weekly load.`
        : `High risk of missing this goal — pace is falling behind. Consider trimming scope.`,
    })
  }

  // 2. The reliability story (the new dimension), softened by how bad it is.
  if (reliability.status === 'unreliable' && slips) {
    out.push({
      tone: 'warning',
      text: `Planning accuracy is low — ${slips}. A lighter weekly load will help you keep commitments.`,
    })
  } else if (reliability.status === 'wavering' && slips) {
    out.push({
      tone: 'caution',
      text: `Plans have wobbled — ${slips}. Keep the weekly load realistic so they hold.`,
    })
  }

  // 3. The "good progress, but…" nuance — pace looks fine, consistency doesn't.
  if (
    progressPercent >= 50 &&
    (reliability.status === 'wavering' || reliability.status === 'unreliable')
  ) {
    out.push({
      tone: 'caution',
      text: `Good progress, but consistency is the real risk here — your plans keep slipping, not your pace.`,
    })
  }

  // 4. Reassurance only when there's genuinely nothing to flag.
  if (out.length === 0 && paceStatus === 'on_track' && reliability.status === 'reliable') {
    out.push({
      tone: 'positive',
      text: `On track and dependable — keep the cadence.`,
    })
  }

  return out.slice(0, 2)
}
