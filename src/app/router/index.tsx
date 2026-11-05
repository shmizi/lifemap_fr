import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/app/layout/AppLayout'
import { ROUTES } from '@/core/constants'
import {
  DashboardPage,
  GoalsPage,
  GoalDetailPage,
  PhaseCheckInPage,
  WeeklyReviewPage,
  RoadmapPage,
  DiscoveryPage,
  SettingsPage,
} from '@/app/router/lazyPages'

// The page elements below are code-split (see lazyPages). The shared Suspense
// boundary lives in AppLayout, around the <Outlet />, so the sidebar and topbar
// stay put while a page chunk arrives — only the content region shows a fallback.
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { path: ROUTES.DASHBOARD,    element: <DashboardPage /> },
      { path: ROUTES.GOALS,        element: <GoalsPage /> },
      // Detail route. Static '/goals' above is matched ahead of this dynamic
      // '/goals/:id' by React Router's ranking, so order here is not fragile.
      { path: ROUTES.GOAL_DETAIL,  element: <GoalDetailPage /> },
      // Phase-end check-in (Phase 10) — a guided 3-beat flow for a completed phase.
      { path: ROUTES.PHASE_CHECK_IN, element: <PhaseCheckInPage /> },
      // The Roadmap screen is routed again. It was unrouted on the reasoning that
      // subgoal dependencies were AI-decided rather than user-facing — but the
      // "Depends on" panel on Goal Detail makes them user-authored, so a map of
      // what supports what is now something the user can actually act on. Reading
      // that map is this screen; editing it stays on Goal Detail.
      { path: ROUTES.ROADMAP,      element: <RoadmapPage /> },
      { path: ROUTES.REVIEWS,      element: <WeeklyReviewPage /> },
      { path: ROUTES.DISCOVERY,    element: <DiscoveryPage /> },
      { path: ROUTES.SETTINGS,     element: <SettingsPage /> },
    ],
  },
])
