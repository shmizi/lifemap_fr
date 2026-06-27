// The application shell: fixed Sidebar on the left, fixed Topbar across the top,
// and a scrollable content region that renders the active route via <Outlet />.
//
// The content region offsets itself by the current sidebar width so nothing is
// hidden underneath it. Because the sidebar width is driven by useUIStore, this
// offset updates automatically when the user collapses the sidebar, and the
// matching transition keeps the two in step.

import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/app/layout/Sidebar'
import { Topbar } from '@/app/layout/Topbar'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useUIStore } from '@/store/useUIStore'
import { useGoalStore } from '@/store/useGoalStore'
import { useDiscoveryStore } from '@/store/useDiscoveryStore'
import { LAYOUT } from '@/core/constants/layout'

export function AppLayout() {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen)
  // A non-fatal data error surfaced once, app-wide, just under the Topbar. Both
  // independent stores (goals + discovery) report through this ONE banner: the
  // goal error takes precedence when both are set, and dismissing clears both so a
  // single click always silences the strip.
  const goalError = useGoalStore((state) => state.error)
  const goalClearError = useGoalStore((state) => state.clearError)
  const discoveryError = useDiscoveryStore((state) => state.error)
  const discoveryClearError = useDiscoveryStore((state) => state.clearError)

  const error = goalError ?? discoveryError
  const clearError = () => {
    goalClearError()
    discoveryClearError()
  }

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
          {/* One Suspense boundary for the lazily-loaded route pages: the shell
              (sidebar + topbar) stays mounted while a page chunk loads, so only
              the content region shows the fallback. */}
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

// Calm placeholder shown in the content region while a route's code chunk loads.
// Matches the app's quiet "...ing" loading register (see the modals / RoadmapPage).
function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <p className="animate-pulse text-sm text-app-text-muted">Loading...</p>
    </div>
  )
}
