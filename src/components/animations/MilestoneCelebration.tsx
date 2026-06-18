// MilestoneCelebration — a brief, calm flourish when a milestone auto-completes.
//
// The UX rules allow gamification ONLY as momentum bars, streaks, and milestone
// celebrations, and animations must reinforce progress rather than decorate. So
// this is a short, soft one-shot: a check pops in, a halo expands, and a few
// sparkles drift outward, then it all fades. No persistent badge, no confetti.
//
// Purely presentational: the parent decides WHEN a completion happened (an
// active -> completed transition) and toggles `show`; this only plays the
// animation. Respects prefers-reduced-motion — reduced-motion users get the
// check with no movement.

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'

interface MilestoneCelebrationProps {
  show: boolean
}

// Offsets (px) the sparkles drift to from the center — a loose ring around the
// check. Kept small so the flourish stays within the card.
const SPARKLES = [
  { x: -24, y: -14 },
  { x: 24, y: -14 },
  { x: -28, y: 8 },
  { x: 28, y: 8 },
  { x: 0, y: -26 },
  { x: 0, y: 22 },
]

export function MilestoneCelebration({ show }: MilestoneCelebrationProps) {
  const reduceMotion = useReducedMotion()

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Expanding halo (skipped under reduced motion). */}
          {!reduceMotion ? (
            <motion.span
              className="absolute h-16 w-16 rounded-full bg-app-secondary/20"
              initial={{ scale: 0.4, opacity: 0.6 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          ) : null}

          {/* The check pops in. */}
          <motion.span
            className="flex h-8 w-8 items-center justify-center rounded-full bg-app-secondary text-app-surface shadow"
            initial={reduceMotion ? { scale: 1 } : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
          >
            <Check size={18} aria-hidden />
          </motion.span>

          {/* Sparkles drift outward and fade (skipped under reduced motion). */}
          {!reduceMotion
            ? SPARKLES.map((s, i) => (
                <motion.span
                  key={i}
                  className="absolute h-1.5 w-1.5 rounded-full bg-app-secondary"
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{ x: s.x, y: s.y, opacity: 0, scale: 0.4 }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
              ))
            : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
