// GoalLearningsPanel — the living "what I've learned" note on the Goal Detail page.
//
// This is how a goal refines "on the way": a low-friction running note the user
// grows while working the goal (constraints they hit, direction that sharpened).
// It is stored on the goal's GoalContext (learnings) and rendered into EVERY AI
// prompt via renderGoalContextLines, so future generations adapt to it — no
// explicit re-sharpen ritual required.
//
// Data flow is the usual one: it reads/writes through useContextStore (never a
// repository directly). It fetches the current note on mount and saves on blur
// (only when the text actually changed), which keeps writes rare without a Save
// button. The parent mounts it with key={goalId} so each goal gets a fresh load.

import { useEffect, useState } from 'react'
import type { ID } from '@/core/types'
import { useContextStore } from '@/store/useContextStore'

export function GoalLearningsPanel({ goalId }: { goalId: ID }) {
  const fetchGoalContext = useContextStore((s) => s.fetchGoalContext)
  const saveGoalLearnings = useContextStore((s) => s.saveGoalLearnings)

  const [loaded, setLoaded] = useState(false)
  const [value, setValue] = useState('')
  // The last persisted text — so a blur with no real change writes nothing.
  const [savedValue, setSavedValue] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    let active = true
    // A failed read leaves the note disabled and empty rather than rejecting into
    // the void — the panel is secondary, so it degrades quietly like the rest of
    // the calm-failure plumbing.
    void fetchGoalContext(goalId)
      .then((ctx) => {
        if (!active) return
        const v = ctx?.learnings ?? ''
        setValue(v)
        setSavedValue(v)
        setLoaded(true)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [goalId, fetchGoalContext])

  async function handleBlur() {
    if (!loaded || value.trim() === savedValue.trim()) return
    setStatus('saving')
    try {
      await saveGoalLearnings(goalId, value)
      setSavedValue(value)
      setStatus('saved')
    } catch {
      setStatus('idle')
    }
  }

  return (
    <section className="mt-4 border border-app-border bg-app-surface-alt p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-app-text">
          What I&rsquo;ve learned
        </h2>
        {status === 'saved' ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-app-text-muted">
            Saved
          </span>
        ) : null}
      </div>
      <div className="mt-2 border-t border-app-border" />
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          if (status === 'saved') setStatus('idle')
        }}
        onBlur={handleBlur}
        rows={3}
        disabled={!loaded}
        placeholder="Jot down what you figure out as you go — constraints, dead ends, what actually matters. The AI reads this and adapts future plans to it."
        className="mt-3 w-full resize-none border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30 disabled:opacity-60"
      />
    </section>
  )
}
