// RowActions — a compact edit + delete control reused by the subgoal, milestone,
// and task rows. Revealed on hover/focus (desktop-first); delete is a two-step
// confirm so a stray click can't destroy work.
//
// Pure UI: it owns no data and performs no writes. It calls the onEdit / onDelete
// callbacks the parent provides. Extracted because three entities need the exact
// same affordance — reuse at the point of need, not a speculative abstraction.
//
// REQUIRES: the parent element must have the Tailwind `group` class, so the
// reveal-on-hover (group-hover) works.

import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'

interface RowActionsProps {
  onEdit: () => void
  onDelete: () => void | Promise<void>
  // What is being acted on, used for accessible labels e.g. "subgoal".
  entityLabel: string
  // Optional side-effect warning shown only in the confirm step, e.g. that
  // dependency links will also be removed. Omit when the delete has no extras.
  confirmHint?: string
}

export function RowActions({
  onEdit,
  onDelete,
  entityLabel,
  confirmHint,
}: RowActionsProps) {
  const [confirming, setConfirming] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete() {
    setIsDeleting(true)
    try {
      await onDelete()
      // The parent usually unmounts this row on success; nothing else to do.
    } catch {
      // On failure, return to a usable state so the user can retry.
      setIsDeleting(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        {confirmHint ? (
          <span className="mr-1 text-xs text-app-text-muted">{confirmHint}</span>
        ) : null}
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:opacity-50"
        >
          {isDeleting ? 'Deleting...' : 'Delete'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isDeleting}
          className="rounded-md px-2 py-1 text-xs font-medium text-app-text-muted transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${entityLabel}`}
        className="rounded-md p-1 text-app-text-muted transition hover:text-app-text focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-app-text/30"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Delete ${entityLabel}`}
        className="rounded-md p-1 text-app-text-muted transition hover:text-red-600 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-app-text/30"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}