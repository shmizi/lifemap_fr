// UpcomingPanel — the glass panel of the nearest waypoints with a deadline:
// goals and subgoals whose target date is still ahead, soonest first. The page
// derives the list from the live map (which carries each node's raw date); this
// just presents it. Renders nothing-to-show calmly rather than as an empty box.

import { format } from 'date-fns'
import { Flag } from '@phosphor-icons/react'
import { GlassPanel } from './GlassPanel'

export interface UpcomingItem {
  id: string
  label: string
  date: string // ISO
}

interface UpcomingPanelProps {
  items: UpcomingItem[]
  initial: { top?: number; left?: number; right?: number; bottom?: number }
  width?: number
}

export function UpcomingPanel({ items, initial, width }: UpcomingPanelProps) {
  return (
    <GlassPanel title="Upcoming" accent="var(--accent-goals)" initial={initial} width={width}>
      {items.length === 0 ? (
        <p className="py-1 text-sm text-app-text-muted">No deadlines ahead.</p>
      ) : (
        <ul className="divide-y divide-app-border">
          {items.slice(0, 5).map((item) => (
            <li key={item.id} className="flex items-center gap-2.5 py-2">
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-app"
                style={{ backgroundColor: 'var(--accent-goals-wash)', color: 'var(--accent-goals)' }}
              >
                <Flag size={13} weight="fill" />
              </span>
              <span className="flex-1 truncate text-[13px] text-app-text">{item.label}</span>
              <span className="font-mono text-[11px] text-app-text-muted">
                {format(new Date(item.date), 'd MMM')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </GlassPanel>
  )
}
