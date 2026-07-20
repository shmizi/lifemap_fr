// Fixed top bar.
// Holds the global theme toggle (right). The app name lives beside the LM tile in
// the Sidebar, and the sidebar toggle lives on that tile too — so the Topbar has
// no wordmark and no toggle button of its own, just the theme control.

import { Sun, Moon } from '@phosphor-icons/react'
import { useUIStore } from '@/store/useUIStore'
import { LAYOUT } from '@/core/constants/layout'

export function Topbar() {
  const theme = useUIStore((state) => state.theme)
  const toggleTheme = useUIStore((state) => state.toggleTheme)

  const isDark = theme === 'dark'

  return (
    <header
      className="flex w-full items-center justify-end border-b border-app-border bg-app-surface px-4"
      style={{ height: LAYOUT.TOPBAR_HEIGHT }}
    >
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
