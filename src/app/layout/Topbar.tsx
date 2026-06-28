// Fixed top bar.
// Holds the two global controls that should always be reachable regardless of
// which page is open: the sidebar toggle (left) and the theme toggle (right).
// Both read from / write to useUIStore so state stays centralized.

import { SidebarSimple, Sun, Moon } from '@phosphor-icons/react'
import { useUIStore } from '@/store/useUIStore'
import { APP_NAME } from '@/core/constants'
import { LAYOUT } from '@/core/constants/layout'

export function Topbar() {
  const theme = useUIStore((state) => state.theme)
  const toggleSidebar = useUIStore((state) => state.toggleSidebar)
  const toggleTheme = useUIStore((state) => state.toggleTheme)

  const isDark = theme === 'dark'

  return (
    <header
      className="flex w-full items-center justify-between border-b border-app-border bg-app-surface px-4"
      style={{ height: LAYOUT.TOPBAR_HEIGHT }}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
          className="flex h-9 w-9 items-center justify-center rounded-app text-app-text-muted transition-colors duration-150 hover:bg-app-surface-alt hover:text-app-text"
        >
          <SidebarSimple size={20} weight="regular" aria-hidden />
        </button>
        <span className="font-display text-base font-semibold tracking-tight text-app-text">
          {APP_NAME}
        </span>
      </div>

      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        className="flex h-9 w-9 items-center justify-center rounded-app text-app-text-muted transition-colors duration-150 hover:bg-app-surface-alt hover:text-app-text"
      >
        {isDark
          ? <Sun size={20} weight="duotone" aria-hidden />
          : <Moon size={20} weight="duotone" aria-hidden />}
      </button>
    </header>
  )
}
