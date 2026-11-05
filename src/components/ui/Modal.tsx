// Modal — the shared overlay + panel shell for the app's dialogs.
//
// Extracted from the four feature modals (Goal/Subgoal/Milestone/Task), which
// each duplicated this exact structure. It owns the overlay, backdrop blur,
// close-on-backdrop-click, the entrance/exit animation, the dialog semantics,
// and the title heading + close button. Callers supply only `title` and the
// form body as `children`.
//
// Behaviour is intentionally identical to the inlined shells it replaces:
// `onClose` fires on backdrop click, on the X button, and on Escape. Callers
// that must block closing mid-save simply pass a guarded handler (the existing
// modals pass their `handleClose`, which no-ops while saving).

import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  maxWidth?: string
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
}: ModalProps) {
  // Escape closes the dialog from ANYWHERE while it is open. This has to be a
  // document listener, not onKeyDown on the panel: a keydown handler on the panel
  // only fires once focus is inside it, and nothing here autofocuses — so on a
  // freshly-opened modal (focus still on the button that opened it) Escape did
  // nothing at all, despite the affordance being documented.
  //
  // onClose is read through a ref so the listener is bound once per open rather
  // than re-bound on every parent render (callers pass inline arrow functions).
  // The ref is written in its own effect, never during render.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [isOpen])

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            // Cap the panel height and let its body scroll, so a tall form (e.g.
            // a goal with its tailoring intake) never overflows the viewport with
            // no way to reach the buttons. The header stays pinned; only the body
            // scrolls. flex-col + min-h-0 on the body is what makes the inner
            // overflow actually scroll inside a flex container.
            className={`relative flex max-h-[88vh] w-full flex-col ${maxWidth} border border-app-border bg-app-surface p-6 shadow-pop`}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex shrink-0 items-center justify-between border-b-2 border-app-rule pb-3">
              <h2 className="font-display text-xl font-semibold tracking-tight text-app-text">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="p-1 text-app-text-muted transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
              >
                <X size={18} />
              </button>
            </div>

            {/* -mr-2 pr-2 insets the scrollbar slightly from the panel edge. */}
            <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
              {children}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}