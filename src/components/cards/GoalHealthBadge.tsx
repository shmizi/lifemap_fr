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

// Editorial: a small status dot + a letterspaced mono label, no filled pill. The
// dot carries the (functional) color; the text stays ink so the register reads calm.
const STYLES: Record<HealthStatus, { label: string; dot: string }> = {
  on_track: { label: 'On track', dot: 'bg-emerald-600' },
  at_risk: { label: 'At risk', dot: 'bg-amber-600' },
  behind: { label: 'Behind', dot: 'bg-red-600' },
}

export function GoalHealthBadge({ status }: GoalHealthBadgeProps) {
  const { label, dot } = STYLES[status]
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-app-text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  )
}
