// Fixed left navigation sidebar — EDITORIAL REGISTRY.
//
// The nav reads like the contents page of a printed index: each destination is a
// two-digit reference number + a letterspaced mono label, ink on paper. There is
// no per-section colour and no thematic iconography (both were "look how themed I
// am" tells); identity comes from typography and a single ink active-marker that
// slides between items (layoutId). Collapsed, only the ref numbers show.

import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useUIStore } from '@/store/useUIStore'
import { useProfile } from '@/core/hooks/useProfile'
import { useColophon } from '@/core/hooks/useColophon'
import { dailyQuote } from '@/core/utils/dailyQuote'
import { APP_NAME, ROUTES } from '@/core/constants'
import { LAYOUT } from '@/core/constants/layout'

interface NavItem {
  label: string
  to: string
  ref: string // two-digit registry index, e.g. "01"
}

// Navigation is data, not markup — defining it as an array keeps the JSX a
// single map and makes adding/reordering pages a one-line change later.
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: ROUTES.DASHBOARD, ref: '01' },
  { label: 'Goals', to: ROUTES.GOALS, ref: '02' },
  { label: 'Roadmap', to: ROUTES.ROADMAP, ref: '03' },
  { label: 'Reviews', to: ROUTES.REVIEWS, ref: '04' },
  { label: 'Discovery', to: ROUTES.DISCOVERY, ref: '05' },
  { label: 'Settings', to: ROUTES.SETTINGS, ref: '06' },
]

export function Sidebar() {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen)
  const toggleSidebar = useUIStore((state) => state.toggleSidebar)
  const { profile } = useProfile()
  const colophon = useColophon(profile?.createdAt)
  // The daily epigraph now lives here (moved off the Dashboard's right rail so that
  // rail fits on one screen). Deterministic per day; see dailyQuote.
  const [quoteText, quoteAuthor] = dailyQuote(new Date())

  const width = sidebarOpen
    ? LAYOUT.SIDEBAR_WIDTH_OPEN
    : LAYOUT.SIDEBAR_WIDTH_COLLAPSED

  return (
    <aside
      className="fixed left-0 top-0 z-20 flex h-screen flex-col border-r border-app-border bg-app-surface"
      style={{ width, transition: 'width 300ms ease-in-out' }}
    >
      {/* Masthead — the LM tile IS the sidebar toggle (no separate topbar button). */}
      <div
        className="flex items-center gap-3 border-b border-app-border px-4"
        style={{ height: LAYOUT.TOPBAR_HEIGHT }}
      >
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className="flex h-8 w-8 shrink-0 items-center justify-center bg-app-text font-mono text-[11px] font-bold tracking-tight text-app-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        >
          LM
        </button>
        {sidebarOpen && (
          <span className="truncate font-display text-lg font-semibold tracking-tight text-app-text">
            {APP_NAME}
          </span>
        )}
      </div>

      {/* Contents index */}
      {sidebarOpen && (
        <p className="px-4 pt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-app-text-muted">
          Contents
        </p>
      )}

      <nav className="flex flex-1 flex-col px-2 py-2">
        {NAV_ITEMS.map(({ label, to, ref }) => (
          <NavLink
            key={to}
            to={to}
            // Dashboard is "/", which would match every route without `end`.
            end={to === ROUTES.DASHBOARD}
            title={!sidebarOpen ? label : undefined}
            className={({ isActive }) =>
              [
                'group relative flex items-center gap-3 px-3 py-2.5 font-mono text-[12px] uppercase tracking-[0.14em] transition-colors duration-150',
                isActive
                  ? 'text-app-text'
                  : 'text-app-text-muted hover:text-app-text',
                sidebarOpen ? '' : 'justify-center',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                {/* One shared ink marker slides between items. */}
                {isActive && (
                  <motion.span
                    layoutId="nav-marker"
                    // Centre with insets, NOT top-1/2 + -translate-y-1/2: Framer's
                    // layoutId animation drives `transform`, which would clobber a
                    // translate-based centering mid-slide (the drift you saw). Sits
                    // flush to the sidebar's left edge (nav has px-2 → -left-2 = 0).
                    className="absolute -left-2 inset-y-1.5 w-[3px] bg-app-text"
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    aria-hidden
                  />
                )}
                <span
                  className={`shrink-0 tabular-nums ${isActive ? 'text-app-text' : 'text-app-text-muted'}`}
                >
                  {ref}
                </span>
                {sidebarOpen && (
                  <span className={`truncate ${isActive ? 'font-semibold' : ''}`}>{label}</span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Colophon foot — reinforces the "printed volume" identity. Volume = the
          year the user joined; Edition = their signup ordinal (see registryColophon). */}
      {sidebarOpen && (
        <div className="border-t border-app-border px-4 py-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-app-text-muted">
            Field Note
          </p>
          <blockquote className="mt-1.5 font-display text-[12px] italic leading-snug text-app-text">
            “{quoteText}”
          </blockquote>
          <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-app-text-muted">
            — {quoteAuthor}
          </p>
        </div>
      )}
      {sidebarOpen && (
        <div className="border-t border-app-border px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-app-text-muted">
          {colophon}
        </div>
      )}
    </aside>
  )
}
