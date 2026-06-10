import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/app/layout/AppLayout'
import { DashboardPage } from '@/pages/DashboardPage'
import { GoalsPage } from '@/pages/GoalsPage'
import { RoadmapPage } from '@/pages/RoadmapPage'
import { ReviewsPage } from '@/pages/ReviewsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ROUTES } from '@/core/constants'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { path: ROUTES.DASHBOARD, element: <DashboardPage /> },
      { path: ROUTES.GOALS,     element: <GoalsPage /> },
      { path: ROUTES.ROADMAP,   element: <RoadmapPage /> },
      { path: ROUTES.REVIEWS,   element: <ReviewsPage /> },
      { path: ROUTES.SETTINGS,  element: <SettingsPage /> },
    ],
  },
])
