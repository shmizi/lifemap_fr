// Fixed left navigation sidebar.
// Reads its open/collapsed state from useUIStore so the topbar toggle and the
// content-area offset stay in sync. Uses NavLink (not a plain Link) because
// NavLink gives us the active state for free, which we need to highlight the
// current page.
//
// Note on color: we intentionally avoid Tailwind opacity modifiers (e.g.
// bg-app-primary/15) on the app-* tokens. Those tokens resolve to hex values
// behind a CSS variable, and Tailwind cannot reliably inject an alpha channel
// into them. We use solid surface tokens plus an accent bar instead.

import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Target,
  Map,
  BarChart2,
  Settings,
  Compass,
  Telescope,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useUIStore } from '@/store/useUIStore'
import { APP_NAME, ROUTES } from '@/core/constants'
import { LAYOUT } from '@/core/constants/layout'

interface NavItem {
  label: string
  to: string
  icon: LucideIcon
}

// Navigation is data, not markup — defining it as an array keeps the JSX a
// single map and makes adding/reordering pages a one-line change later.
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: ROUTES.DASHBOARD, icon: LayoutDashboard },
  { label: 'Goals',     to: ROUTES.GOALS,     icon: Target },
  { label: 'Roadmap',   to: ROUTES.ROADMAP,   icon: Map },
  { label: 'Reviews',   to: ROUTES.REVIEWS,   icon: BarChart2 },
  { label: 'Discovery', to: ROUTES.DISCOVERY, icon: Telescope },
  { label: 'Settings',  to: ROUTES.SETTINGS,  icon: Settings },
]

export function Sidebar() {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen)

  const width = sidebarOpen
    ? LAYOUT.SIDEBAR_WIDTH_OPEN
    : LAYOUT.SIDEBAR_WIDTH_COLLAPSED

  return (
    <aside
      className="fixed left-0 top-0 z-20 flex h-screen flex-col border-r border-app-border bg-app-surface transition-[width] duration-300 ease-in-out"
      style={{ width }}
    >
      {/* Logo / app name area */}
      <div
        className="flex items-center gap-3 px-4"
        style={{ height: LAYOUT.TOPBAR_HEIGHT }}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-app bg-app-surface-alt text-app-primary">
          <Compass size={20} aria-hidden />
        </div>
        {sidebarOpen && (
          <span className="truncate text-lg font-semibold text-app-text">
            {APP_NAME}
          </span>
        )}
      </div>

      {/* Navigation links */}
      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {NAV_ITEMS.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            // Dashboard is "/", which would match every route without `end`.
            end={to === ROUTES.DASHBOARD}
            title={!sidebarOpen ? label : undefined}
            className={({ isActive }) =>
              [
                'group relative flex items-center gap-3 rounded-app px-3 py-2.5 text-sm font-medium transition-colors duration-150',
                isActive
                  ? 'bg-app-surface-alt text-app-primary'
                  : 'text-app-text-muted hover:bg-app-surface-alt hover:text-app-text',
                sidebarOpen ? '' : 'justify-center',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                {/* Accent bar marks the active page without relying on color opacity */}
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-app-primary"
                    aria-hidden
                  />
                )}
                <Icon size={20} className="shrink-0" aria-hidden />
                {sidebarOpen && <span className="truncate">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
