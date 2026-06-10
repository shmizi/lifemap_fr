// Controls UI state that needs to persist across page navigation.
// Theme preference is persisted to localStorage so it survives page refresh.
// Sidebar state is NOT persisted — always opens expanded.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarOpen: boolean
  theme: 'light' | 'dark'
  // Actions
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  toggleTheme: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      theme: 'light',
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
    }),
    {
      name: 'lifemap-ui-storage',
      // Only persist theme — sidebar should always start open
      partialize: (state) => ({ theme: state.theme }),
    }
  )
)
