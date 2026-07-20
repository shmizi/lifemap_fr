// Registry — the shared building blocks of the "Editorial Registry" look, used by
// every screen so the whole app reads as one printed index.
//
// Nothing here carries business logic or color: identity comes from typography
// (Fraunces display + Space Grotesk mono micro-labels), hairline/ink rules, and
// square geometry. Separation is done with rules and whitespace, never shadow.

import type { ReactNode } from 'react'

// ── RegistryPage ─────────────────────────────────────────────────────────────
// A screen masthead: a mono kicker, a big serif title, an optional sub/meta line,
// an optional right-aligned readout (a tally, a percent), and actions. Closed by a
// heavy ink rule. Every page opens with one of these.
interface RegistryPageProps {
  kicker?: string
  title: string
  subtitle?: ReactNode
  /** Right-aligned readout, e.g. a big number + label (see RegistryReadout). */
  readout?: ReactNode
  /** Right-aligned action controls (buttons). Sit above the rule. */
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export function RegistryPage({
  kicker,
  title,
  subtitle,
  readout,
  actions,
  children,
  className = '',
}: RegistryPageProps) {
  return (
    <div className={`mx-auto max-w-5xl ${className}`}>
      <header className="flex items-end justify-between gap-6 border-b-2 border-app-rule pb-4">
        <div className="min-w-0">
          {kicker && (
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-app-text-muted">
              {kicker}
            </p>
          )}
          <h1 className="mt-2 font-display text-3xl font-semibold leading-none tracking-tight text-app-text">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-app-text-muted">
              {subtitle}
            </p>
          )}
        </div>
        {(readout || actions) && (
          <div className="flex shrink-0 items-end gap-4">
            {actions}
            {readout}
          </div>
        )}
      </header>
      <div className="mt-8">{children}</div>
    </div>
  )
}

// A big-number + label block for the masthead's right edge.
export function RegistryReadout({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="text-right">
      <div className="font-display text-3xl font-semibold leading-none tracking-tight text-app-text">
        {value}
      </div>
      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-app-text-muted">
        {label}
      </p>
    </div>
  )
}

// ── RegistrySection ──────────────────────────────────────────────────────────
// A titled block within a page: a letterspaced mono label, optional right meta,
// a rule beneath the title (heavy or hairline), then the body.
interface RegistrySectionProps {
  title: string
  /** Small right-aligned meta — a ref code, a count, a date. */
  meta?: ReactNode
  /** Heavy ink rule (masthead-weight) vs. thin hairline. Default heavy. */
  weight?: 'heavy' | 'hair'
  className?: string
  children: ReactNode
}

export function RegistrySection({
  title,
  meta,
  weight = 'heavy',
  className = '',
  children,
}: RegistrySectionProps) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-app-text">
          {title}
        </h2>
        {meta != null && (
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-app-text-muted">
            {meta}
          </span>
        )}
      </div>
      <div
        className={
          weight === 'heavy'
            ? 'mt-2 border-t-2 border-app-rule'
            : 'mt-2 border-t border-app-border'
        }
      />
      <div className="pt-3">{children}</div>
    </section>
  )
}

// LeaderRow — a "label ............ value" line with printed dotted leaders.
export function LeaderRow({
  label,
  value,
  emphasize = false,
}: {
  label: ReactNode
  value: ReactNode
  emphasize?: boolean
}) {
  return (
    <div className="flex items-baseline py-1.5 text-[13px]">
      <span className={emphasize ? 'font-medium text-app-text' : 'text-app-text'}>
        {label}
      </span>
      <span
        aria-hidden
        className="mx-2 flex-1 translate-y-[-3px] border-b border-dotted border-app-border"
      />
      <span className="shrink-0 font-mono tabular-nums text-app-text">{value}</span>
    </div>
  )
}

// ── RegistryButton ───────────────────────────────────────────────────────────
// The one button style: square, mono, uppercase. `variant` picks ink-filled
// (primary), outlined (secondary), or quiet (ghost). Not exhaustive — pages with
// bespoke controls can still hand-roll, but this covers the common cases.
type ButtonVariant = 'primary' | 'secondary' | 'ghost'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-app-text text-app-surface hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40',
  secondary:
    'border border-app-border text-app-text hover:bg-app-surface-alt disabled:cursor-not-allowed disabled:opacity-40',
  ghost: 'text-app-text-muted hover:text-app-text',
}

export function RegistryButton({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: {
  variant?: ButtonVariant
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30 ${BUTTON_VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
