// Fixed left navigation sidebar.
// Reads its open/collapsed state from useUIStore so the topbar toggle and the
// content-area offset stay in sync. Uses NavLink (not a plain Link) because
// NavLink gives us the active state for free, which we need to highlight the
// current page.
//
// "Field Notes" identity: thematic Phosphor icons (compass / summit / route /
// journal / constellation / toolbox) instead of literal ones, and each page
// lights up in its OWN map pigment when active — so color tells you where you
// are. A single Framer-Motion indicator slides between items (layoutId).
//
// Note on color: we intentionally avoid Tailwind opacity modifiers (e.g.
// bg-app-primary/15) on the app-* / accent-* tokens. Those tokens resolve to hex
// values behind a CSS variable, and Tailwind cannot reliably inject an alpha
// channel into them. We use solid wash tokens plus an accent bar instead. The
// per-item accent classes are written as full literal strings so Tailwind's
// content scanner generates them.

import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Compass,
  Mountains,
  Notebook,
  Sparkle,
  Toolbox,
  CompassRose,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { useUIStore } from '@/store/useUIStore'
import { APP_NAME, ROUTES } from '@/core/constants'
import { LAYOUT } from '@/core/constants/layout'

interface NavItem {
  label: string
  to: string
  icon: Icon
  // Full literal Tailwind classes (so the scanner picks them up).
  activeText: string
  activeWash: string
  activeBar: string
}

// Navigation is data, not markup — defining it as an array keeps the JSX a
// single map and makes adding/reordering pages a one-line change later.
const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard', to: ROUTES.DASHBOARD, icon: Compass,
    activeText: 'text-accent-dashboard', activeWash: 'bg-accent-dashboard-wash', activeBar: 'bg-accent-dashboard',
  },
  {
    label: 'Goals', to: ROUTES.GOALS, icon: Mountains,
    activeText: 'text-accent-goals', activeWash: 'bg-accent-goals-wash', activeBar: 'bg-accent-goals',
  },
  {
    label: 'Reviews', to: ROUTES.REVIEWS, icon: Notebook,
    activeText: 'text-accent-reviews', activeWash: 'bg-accent-reviews-wash', activeBar: 'bg-accent-reviews',
  },
  {
    label: 'Discovery', to: ROUTES.DISCOVERY, icon: Sparkle,
    activeText: 'text-accent-discovery', activeWash: 'bg-accent-discovery-wash', activeBar: 'bg-accent-discovery',
  },
  {
    label: 'Settings', to: ROUTES.SETTINGS, icon: Toolbox,
    activeText: 'text-accent-settings', activeWash: 'bg-accent-settings-wash', activeBar: 'bg-accent-settings',
  },
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
      {/* Logo / app name area — a compass rose in a teal expedition tile. */}
      <div
        className="flex items-center gap-3 px-4"
        style={{ height: LAYOUT.TOPBAR_HEIGHT }}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-app bg-gradient-to-br from-app-primary to-app-primary-h text-white shadow-card">
          <CompassRose size={22} weight="fill" aria-hidden />
        </div>
        {sidebarOpen && (
          <span className="truncate font-display text-lg font-semibold text-app-text">
            {APP_NAME}
          </span>
        )}
      </div>

      {/* Navigation links */}
      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {NAV_ITEMS.map(({ label, to, icon: Icon, activeText, activeWash, activeBar }) => (
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
                  ? `${activeWash} ${activeText}`
                  : 'text-app-text-muted hover:bg-app-surface-alt hover:text-app-text',
                sidebarOpen ? '' : 'justify-center',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                {/* One shared indicator slides between items and morphs to the
                    active page's pigment. */}
                {isActive && (
                  <motion.span
                    layoutId="nav-accent"
                    className={`absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r ${activeBar}`}
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    aria-hidden
                  />
                )}
                <Icon
                  size={21}
                  weight={isActive ? 'fill' : 'duotone'}
                  className="shrink-0"
                  aria-hidden
                />
                {sidebarOpen && <span className="truncate">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
