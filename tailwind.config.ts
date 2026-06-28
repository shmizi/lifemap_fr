import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'

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

        // Per-section map pigments + their solid washes. One identity per screen.
        'accent-dashboard':      'var(--accent-dashboard)',
        'accent-dashboard-wash': 'var(--accent-dashboard-wash)',
        'accent-goals':          'var(--accent-goals)',
        'accent-goals-wash':     'var(--accent-goals-wash)',
        'accent-roadmap':        'var(--accent-roadmap)',
        'accent-roadmap-wash':   'var(--accent-roadmap-wash)',
        'accent-reviews':        'var(--accent-reviews)',
        'accent-reviews-wash':   'var(--accent-reviews-wash)',
        'accent-discovery':      'var(--accent-discovery)',
        'accent-discovery-wash': 'var(--accent-discovery-wash)',
        'accent-settings':       'var(--accent-settings)',
        'accent-settings-wash':  'var(--accent-settings-wash)',
      },
      borderRadius: {
        'app': '10px',
        'app-lg': '16px',
      },
      fontFamily: {
        // `sans` stays the default body face; `display` is the literary serif
        // used for headings; `mono` is the tabular numeral face.
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['Space Grotesk', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
    },
  },
  plugins: [
    // `can-hover:` applies only on devices that actually support hover (mouse /
    // trackpad). Used to gate hover-reveal affordances: controls hidden until
    // hover on the desktop, but ALWAYS visible on touch devices, where there is
    // no hover to reveal them. The inverse of relying on a bare opacity-0 base.
    plugin(({ addVariant }) => {
      addVariant('can-hover', '@media (hover: hover)')
    }),
  ],
}

export default config
