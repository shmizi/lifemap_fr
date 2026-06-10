// ThemeProvider watches the theme value in Zustand and syncs it to the <html> element.
// We use the 'dark' class approach because TailwindCSS darkMode: 'class' requires it.
// The Zustand store is the single source of truth — this component just reflects it to the DOM.

import { useEffect } from 'react'
import { useUIStore } from '@/store/useUIStore'

interface ThemeProviderProps {
  children: React.ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const theme = useUIStore((state) => state.theme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme])

  return <>{children}</>
}
