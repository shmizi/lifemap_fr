// The application shell: fixed Sidebar on the left, fixed Topbar across the top,
// and a scrollable content region that renders the active route via <Outlet />.
//
// The content region offsets itself by the current sidebar width so nothing is
// hidden underneath it. Because the sidebar width is driven by useUIStore, this
// offset updates automatically when the user collapses the sidebar, and the
// matching transition keeps the two in step.

import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/app/layout/Sidebar'
import { Topbar } from '@/app/layout/Topbar'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useUIStore } from '@/store/useUIStore'
import { useGoalStore } from '@/store/useGoalStore'
import { LAYOUT } from '@/core/constants/layout'

export function AppLayout() {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen)
  // A non-fatal data error surfaced once, app-wide, just under the Topbar.
  const error = useGoalStore((state) => state.error)
  const clearError = useGoalStore((state) => state.clearError)

  const sidebarWidth = sidebarOpen
    ? LAYOUT.SIDEBAR_WIDTH_OPEN
    : LAYOUT.SIDEBAR_WIDTH_COLLAPSED

  return (
    <div className="min-h-screen bg-app-bg text-app-text">
      <Sidebar />

      {/* Everything to the right of the sidebar shifts by the sidebar width. */}
      <div
        className="flex min-h-screen flex-col transition-[margin] duration-300 ease-in-out"
        style={{ marginLeft: sidebarWidth }}
      >
        {/* Topbar is sticky so it stays visible while the content scrolls; the
            error banner rides with it so a non-fatal failure is always visible. */}
        <div className="sticky top-0 z-10">
          <Topbar />
          {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
        </div>

        <main
          className="flex-1"
          style={{ padding: LAYOUT.CONTENT_PADDING }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
