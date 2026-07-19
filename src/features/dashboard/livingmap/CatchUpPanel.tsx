// CatchUpPanel — the cross-goal "you've missed some work" nudge on the living map.
//
// Appears only when tasks have slipped past their date across ANY goal (the page
// mounts it conditionally on the store's overdueTasks). One tap pulls every goal's
// missed work forward onto upcoming working days under a single shared daily budget
// (store.rescheduleAllOverdue), so recovery respects real capacity. Pure presentation:
// the page owns the count, the busy flag, the note, and the callback — like the other
// panels. Once nothing is overdue the page unmounts this, which is the success signal.

import { CalendarCheck } from '@phosphor-icons/react'
import { GlassPanel } from './GlassPanel'

interface CatchUpPanelProps {
  count: number
  isRescheduling: boolean
  note: string | null
  onReschedule: () => void
  initial: { top?: number; left?: number; right?: number; bottom?: number }
  width?: number
}

export function CatchUpPanel({
  count,
  isRescheduling,
  note,
  onReschedule,
  initial,
  width,
}: CatchUpPanelProps) {
  return (
    <GlassPanel title="Catch up" accent="var(--accent-dashboard)" initial={initial} width={width}>
      <p className="text-[13px] text-app-text">
        <span className="font-semibold" style={{ color: 'var(--accent-dashboard)' }}>
          {count} missed task{count === 1 ? '' : 's'}
        </span>{' '}
        slipped past across your goals.
      </p>
      <button
        type="button"
        onClick={onReschedule}
        disabled={isRescheduling}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-app bg-app-text px-3 py-2 text-[13px] font-semibold text-app-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
      >
        <CalendarCheck size={15} weight="bold" />
        {isRescheduling ? 'Rescheduling…' : 'Reschedule onto upcoming days'}
      </button>
      {note ? <p className="mt-2 text-[11px] text-app-text-muted">{note}</p> : null}
    </GlassPanel>
  )
}
