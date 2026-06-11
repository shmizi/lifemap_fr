import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/app/layout/AppLayout'
import { DashboardPage } from '@/pages/DashboardPage'
import { GoalsPage } from '@/pages/GoalsPage'
import { GoalDetailPage } from '@/pages/GoalDetailPage'
import { RoadmapPage } from '@/pages/RoadmapPage'
import { ReviewsPage } from '@/pages/ReviewsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ROUTES } from '@/core/constants'

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
      { path: ROUTES.ROADMAP,      element: <RoadmapPage /> },
      { path: ROUTES.REVIEWS,      element: <ReviewsPage /> },
      { path: ROUTES.SETTINGS,     element: <SettingsPage /> },
    ],
  },
])