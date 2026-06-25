// GoalHealthBadge — a small, calm pill showing whether a goal is keeping pace
// with its deadline.
//
// Pure presentation: it owns only the status -> label + colour mapping. The
// health itself is computed by the engine (computeGoalHealth) and held in the
// store; the parent passes the status in. Typed structurally (the three real
// statuses) so this component does not import the engine — same layering rule the
// other card/snapshot components follow. The 'no_tasks' case never reaches here:
// the parent renders no badge when there's nothing to assess.
//
// Tone is deliberately gentle — "Behind" informs, it does not alarm. The product
// stays calm; this is a nudge, not a red siren.

type HealthStatus = 'on_track' | 'at_risk' | 'behind'

interface GoalHealthBadgeProps {
  status: HealthStatus
}

const STYLES: Record<HealthStatus, { label: string; className: string }> = {
  on_track: {
    label: 'On track',
    className: 'border-emerald-500/30 text-emerald-600 bg-emerald-500/10',
  },
  at_risk: {
    label: 'At risk',
    className: 'border-amber-500/30 text-amber-600 bg-amber-500/10',
  },
  behind: {
    label: 'Behind',
    className: 'border-red-500/30 text-red-600 bg-red-500/10',
  },
}

export function GoalHealthBadge({ status }: GoalHealthBadgeProps) {
  const { label, className } = STYLES[status]
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  )
}
