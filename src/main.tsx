import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { ThemeProvider } from '@/app/providers/ThemeProvider'
import { router } from '@/app/router'
import { useAuthStore } from '@/store/useAuthStore'
import '@/styles/globals.css'

// Resolve the current session (or mark accounts unconfigured) before first paint,
// and keep it in sync via the auth listener. Fire-and-forget: init subscribes and
// returns; the store flips status as Supabase reports it. Safe with no keys.
useAuthStore.getState().init()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>
)
