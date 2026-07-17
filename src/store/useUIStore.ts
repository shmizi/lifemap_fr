// Controls UI state that needs to persist across page navigation.
// Theme preference is persisted to localStorage so it survives page refresh.
// Sidebar state is NOT persisted — always opens expanded.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarOpen: boolean
  theme: 'light' | 'dark'
  // Whether in-app task reminders are on (device preference; the actual OS
  // permission is separate and asked for when the user enables this).
  remindersEnabled: boolean
  // Actions
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  toggleTheme: () => void
  setRemindersEnabled: (enabled: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      theme: 'light',
      remindersEnabled: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setRemindersEnabled: (enabled) => set({ remindersEnabled: enabled }),
    }),
    {
      name: 'lifemap-ui-storage',
      // Persist device preferences (theme + reminders); sidebar always starts open.
      partialize: (state) => ({
        theme: state.theme,
        remindersEnabled: state.remindersEnabled,
      }),
    }
  )
)
