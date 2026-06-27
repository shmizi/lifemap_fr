// AppearanceSection — the theme control on the Settings page. A thin view over
// useUIStore (the same store the Topbar's quick toggle uses), so the two stay in
// sync automatically. Theme is persisted to localStorage by the store, not the
// profile table — it is a device preference, not user-profile data.

import { Sun, Moon } from 'lucide-react'
import { useUIStore } from '@/store/useUIStore'

const segmentBase =
  'flex flex-1 items-center justify-center gap-2 rounded-app-lg px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'

export function AppearanceSection() {
  const theme = useUIStore((s) => s.theme)
  const toggleTheme = useUIStore((s) => s.toggleTheme)

  // Two themes only, so "select the one that isn't active" is just the toggle.
  const selectTheme = (next: 'light' | 'dark') => {
    if (next !== theme) toggleTheme()
  }

  return (
    <section className="rounded-app-lg border border-app-border bg-app-surface p-6">
      <h2 className="text-base font-semibold text-app-text">Appearance</h2>
      <p className="mt-1 text-sm text-app-text-muted">
        Choose how LifeMap looks on this device.
      </p>

      <div
        role="radiogroup"
        aria-label="Theme"
        className="mt-5 flex gap-2 rounded-app-lg border border-app-border bg-app-surface-alt p-1"
      >
        <button
          type="button"
          role="radio"
          aria-checked={theme === 'light'}
          onClick={() => selectTheme('light')}
          className={`${segmentBase} ${
            theme === 'light'
              ? 'bg-app-text text-app-surface'
              : 'text-app-text-muted hover:text-app-text'
          }`}
        >
          <Sun size={16} />
          Light
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={theme === 'dark'}
          onClick={() => selectTheme('dark')}
          className={`${segmentBase} ${
            theme === 'dark'
              ? 'bg-app-text text-app-surface'
              : 'text-app-text-muted hover:text-app-text'
          }`}
        >
          <Moon size={16} />
          Dark
        </button>
      </div>
    </section>
  )
}
