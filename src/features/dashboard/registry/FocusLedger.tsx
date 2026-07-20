// FocusLedger — the hero of the Editorial Registry dashboard: today's entries,
// as numbered ledger lines you can strike through. Data is the same as the old
// TodayFocusPanel (today's scheduled tasks, or the cross-goal priority list when
// today is empty); the presentation is a printed worklist, not a glass panel.

import { Check } from '@phosphor-icons/react'
import type { Task } from '@/core/types'

interface FocusLedgerProps {
  tasks: Task[]
  onToggle: (task: Task) => void
}

function formatMins(m?: number): string | null {
  if (!m) return null
  return m >= 60 ? `${Math.round((m / 60) * 10) / 10}h` : `${m}m`
}

export function FocusLedger({ tasks, onToggle }: FocusLedgerProps) {
  if (tasks.length === 0) {
    return (
      <p className="py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-app-text-muted">
        No entries logged for today.
      </p>
    )
  }

  return (
    <ul>
      {tasks.slice(0, 8).map((task, i) => {
        const done = task.status === 'completed'
        const mins = formatMins(task.estimatedMinutes)
        return (
          <li
            key={task.id}
            className="flex items-center gap-3 border-b border-app-border py-2.5 last:border-b-0"
          >
            <span className="w-6 shrink-0 font-mono text-[11px] tabular-nums text-app-text-muted">
              {String(i + 1).padStart(2, '0')}
            </span>
            <button
              type="button"
              onClick={() => onToggle(task)}
              aria-label={done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
              className={`grid h-4 w-4 shrink-0 place-items-center border transition-colors ${
                done
                  ? 'border-app-text bg-app-text text-app-surface'
                  : 'border-app-text-muted text-transparent hover:border-app-text'
              }`}
            >
              <Check size={10} weight="bold" />
            </button>
            <span
              className={`flex-1 text-[14px] ${
                done ? 'text-app-text-muted line-through' : 'text-app-text'
              }`}
            >
              {task.title}
            </span>
            {mins && (
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-app-text-muted">
                {mins}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
