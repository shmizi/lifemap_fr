// ErrorBanner — a calm, dismissible strip for a non-fatal app error (e.g. a
// background data load/refresh failed).
//
// Pure visual, zero business logic: it renders the message it is given and calls
// onDismiss. The store owns the error state; the app shell wires this up. Tone is
// gentle — it informs that the view may be stale and offers a way to dismiss,
// never an alarming modal that blocks the app.

import { X } from 'lucide-react'

interface ErrorBannerProps {
  message: string
  onDismiss: () => void
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 border-b border-red-500/30 bg-red-500/10 px-6 py-2.5 text-sm text-red-700 dark:text-red-300"
    >
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-0.5 text-red-700/80 transition hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 dark:text-red-300/80 dark:hover:text-red-300"
      >
        <X size={16} />
      </button>
    </div>
  )
}
