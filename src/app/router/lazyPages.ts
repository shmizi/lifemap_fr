// Lazily-loaded route pages, kept in their own module so each becomes its own
// code-split chunk: the initial bundle carries only the app shell + the first
// page, not every screen's deps (React Flow on the roadmap, Recharts on the
// dashboard/review, etc.). React.lazy needs a default export; the pages are named
// exports, so each import maps its named export to `default`.
//
// Separated from router/index.tsx on purpose: that file also exports the non-
// component `router`, and react-refresh wants a module to export ONLY components.
// Here every export IS a (lazy) component, so the rule is satisfied and Fast
// Refresh stays happy.

import { lazy } from 'react'

export const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
export const GoalsPage = lazy(() =>
  import('@/pages/GoalsPage').then((m) => ({ default: m.GoalsPage })),
)
export const GoalDetailPage = lazy(() =>
  import('@/pages/GoalDetailPage').then((m) => ({ default: m.GoalDetailPage })),
)
export const RoadmapPage = lazy(() =>
  import('@/pages/RoadmapPage').then((m) => ({ default: m.RoadmapPage })),
)
export const WeeklyReviewPage = lazy(() =>
  import('@/pages/WeeklyReviewPage').then((m) => ({
    default: m.WeeklyReviewPage,
  })),
)
export const DiscoveryPage = lazy(() =>
  import('@/pages/DiscoveryPage').then((m) => ({ default: m.DiscoveryPage })),
)
export const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
