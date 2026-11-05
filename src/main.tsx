import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { ThemeProvider } from '@/app/providers/ThemeProvider'
import { router } from '@/app/router'
import { useAuthStore } from '@/store/useAuthStore'
import { useGoalStore } from '@/store/useGoalStore'
import { onBackendChange } from '@/database/backend'
import '@/styles/globals.css'

// Resolve the current session (or mark accounts unconfigured) before first paint,
// and keep it in sync via the auth listener. Fire-and-forget: init subscribes and
// returns; the store flips status as Supabase reports it. Safe with no keys.
useAuthStore.getState().init()

// Two-mode storage (guest Dexie ↔ signed-in Supabase): the live backend switches the
// moment the signed-in user resolves (or clears on sign-out), which happens
// asynchronously — AFTER a page's first data load may already have read the previous
// backend. And on first sign-in the Dexie→Supabase migration seeds the account a beat
// later still. So re-load the primary windows on every such change, so the UI always
// reflects the backend that is now live. Harmless for a guest who never signs in (the
// listener simply never fires).
onBackendChange(() => {
  const store = useGoalStore.getState()
  void store.loadGoals()
  void store.loadDashboard()
  // The life map too: the Dashboard gates its ENTIRE render on it (no map -> the
  // "register is empty" screen), and its hook loads it once on mount. Without this
  // a user who signs in while the Dashboard is open keeps staring at the empty
  // state even though their goals have already arrived from the cloud backend.
  void store.loadLifeMap()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>
)
