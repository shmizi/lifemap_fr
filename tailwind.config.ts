import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // These reference CSS custom properties defined in globals.css.
        // This lets us switch themes by changing one class on <html>.
        'app-bg':          'var(--color-bg)',
        'app-surface':     'var(--color-surface)',
        'app-surface-alt': 'var(--color-surface-alt)',
        'app-text':        'var(--color-text)',
        'app-text-muted':  'var(--color-text-muted)',
        'app-primary':     'var(--color-primary)',
        'app-primary-h':   'var(--color-primary-hover)',
        'app-secondary':   'var(--color-secondary)',
        'app-border':      'var(--color-border)',
        'app-warning':     'var(--color-warning)',
        'app-danger':      'var(--color-danger)',
      },
      borderRadius: {
        'app': '10px',
        'app-lg': '16px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
