// TodayFocusPanel — the glass panel listing what to do now, with working
// completion toggles. Pure presentation: the page passes the tasks (today's
// scheduled, or the cross-goal priority list when today is empty) and the toggle
// action; this renders them and calls back. Checking a row goes through the
// store's real toggleTaskComplete, so the map and panels update together.

import { Check } from '@phosphor-icons/react'
import type { Task } from '@/core/types'
import { GlassPanel } from './GlassPanel'

interface TodayFocusPanelProps {
  tasks: Task[]
  onToggle: (task: Task) => void
  initial: { top?: number; left?: number; right?: number; bottom?: number }
  width?: number
}

function formatMins(m?: number): string | null {
  if (!m) return null
  return m >= 60 ? `${Math.round((m / 60) * 10) / 10}h` : `${m}m`
}

export function TodayFocusPanel({ tasks, onToggle, initial, width }: TodayFocusPanelProps) {
  return (
    <GlassPanel title="Today's Focus" accent="var(--accent-roadmap)" initial={initial} width={width}>
      {tasks.length === 0 ? (
        <p className="py-1 text-sm text-app-text-muted">Nothing scheduled — enjoy the view.</p>
      ) : (
        <ul className="divide-y divide-app-border">
          {tasks.slice(0, 6).map((task) => {
            const done = task.status === 'completed'
            const mins = formatMins(task.estimatedMinutes)
            return (
              <li key={task.id} className="flex items-center gap-2.5 py-2">
                <button
                  type="button"
                  onClick={() => onToggle(task)}
                  aria-label={done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                    done
                      ? 'border-app-primary bg-app-primary text-white'
                      : 'border-app-text-muted/50 text-transparent hover:border-app-primary'
                  }`}
                >
                  <Check size={11} weight="bold" />
                </button>
                <span className={`flex-1 text-[13px] ${done ? 'text-app-text-muted line-through' : 'text-app-text'}`}>
                  {task.title}
                </span>
                {mins && <span className="font-mono text-[11px] text-app-text-muted">{mins}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </GlassPanel>
  )
}
