// SlipReasonModal — asks WHY tasks slipped before rescheduling them (Stage 3).
//
// Shared by both reschedule entry points (the dashboard "catch up" and a goal's
// Detail View). It captures ONE reason for the whole batch (rescheduling is bulk,
// so a per-task prompt would be tedious) and is skippable — a skip still reschedules,
// it just records 'unspecified'. The parent owns the actual reschedule; this only
// collects the reason and hands it back via onSelect.

import { Modal } from '@/components/ui/Modal'
import { SLIP_REASON_OPTIONS } from '@/core/constants'
import type { SlipReason } from '@/core/types'

interface SlipReasonModalProps {
  isOpen: boolean
  onClose: () => void
  // Called with the chosen reason (or 'unspecified' on skip). The parent then
  // performs the reschedule and closes the modal.
  onSelect: (reason: SlipReason) => void
  isBusy?: boolean
  // How many tasks the reschedule will move, for a bit of context in the copy.
  count?: number
}

export function SlipReasonModal({
  isOpen,
  onClose,
  onSelect,
  isBusy = false,
  count,
}: SlipReasonModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      // Don't let a backdrop/Escape close mid-reschedule.
      onClose={isBusy ? () => {} : onClose}
      title="Why did this slip?"
      maxWidth="max-w-md"
    >
      <div className="pt-4">
        <p className="text-sm text-app-text-muted">
          {count != null && count > 0
            ? `${count} task${count === 1 ? '' : 's'} will move onto your upcoming days. `
            : ''}
          A quick note on why helps LifeMap spot patterns — it never judges.
        </p>

        <div className="mt-4 space-y-2">
          {SLIP_REASON_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={isBusy}
              onClick={() => onSelect(o.value)}
              className="w-full border border-app-border px-4 py-3 text-left text-sm text-app-text transition hover:bg-app-surface-alt disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              {o.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => onSelect('unspecified')}
          className="mt-4 w-full py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-app-text-muted transition hover:text-app-text disabled:opacity-50"
        >
          {isBusy ? 'Rescheduling…' : 'Skip — just reschedule'}
        </button>
      </div>
    </Modal>
  )
}
