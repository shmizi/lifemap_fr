// AccountSection — the sign-in surface on the Settings page (ADR-0003 step 1).
//
// Optional sign-in over a local-first app: everything here is additive. When this
// build has no Supabase keys the section renders a calm "not set up" note and does
// nothing else. Signed out, it offers Google OAuth and a passwordless email magic
// link (we NEVER take a password — auth is Supabase's job). Signed in, it shows the
// account email, the durable edition/volume the profile assigns, and a sign-out.
//
// Thin view over useAuthStore, exactly like AppearanceSection is over useUIStore —
// no direct Supabase access here.

import { useState } from 'react'
import { GoogleLogo, EnvelopeSimple, SignOut } from '@phosphor-icons/react'
import { useAuthStore } from '@/store/useAuthStore'
import { registryColophon } from '@/core/utils/colophon'

const buttonBase =
  'flex w-full items-center justify-center gap-2 border border-app-border px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30 disabled:opacity-50'

function SectionShell({
  children,
  blurb,
}: {
  children: React.ReactNode
  blurb: string
}) {
  return (
    <section className="border border-app-border bg-app-surface p-6">
      <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-app-text">
        Account
      </h2>
      <div className="mt-2 border-t border-app-border" />
      <p className="pt-3 text-sm text-app-text-muted">{blurb}</p>
      <div className="mt-5">{children}</div>
    </section>
  )
}

export function AccountSection() {
  const status = useAuthStore((s) => s.status)
  const email = useAuthStore((s) => s.email)
  const profile = useAuthStore((s) => s.profile)
  const notice = useAuthStore((s) => s.notice)
  const isWorking = useAuthStore((s) => s.isWorking)
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle)
  const signInWithEmail = useAuthStore((s) => s.signInWithEmail)
  const signOut = useAuthStore((s) => s.signOut)

  const [emailInput, setEmailInput] = useState('')

  // No accounts in this build (no Supabase keys) — say so plainly and stop.
  if (status === 'unconfigured') {
    return (
      <SectionShell blurb="Sign-in isn’t configured in this build.">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-app-text-muted">
          Your data lives on this device. Add Supabase keys to enable accounts —
          see supabase/README.
        </p>
      </SectionShell>
    )
  }

  if (status === 'loading') {
    return (
      <SectionShell blurb="Your account and where your data lives.">
        <p className="animate-pulse font-mono text-[11px] uppercase tracking-[0.16em] text-app-text-muted">
          Checking your session…
        </p>
      </SectionShell>
    )
  }

  if (status === 'signed_in') {
    return (
      <SectionShell blurb="You’re signed in. Your data still lives on this device for now.">
        <dl className="space-y-2 font-mono text-[11px] uppercase tracking-[0.14em]">
          <div className="flex justify-between gap-4">
            <dt className="text-app-text-muted">Signed in as</dt>
            <dd className="truncate text-app-text">{email ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-app-text-muted">Edition</dt>
            <dd className="text-app-text">
              {profile
                ? registryColophon(profile.joinedYear, profile.edition)
                : 'Assigning…'}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={isWorking}
          className={`${buttonBase} mt-5 text-app-text-muted hover:text-app-text`}
        >
          <SignOut size={16} />
          Sign out
        </button>
      </SectionShell>
    )
  }

  // signed_out — offer Google + email magic link.
  return (
    <SectionShell blurb="Sign in so your edition and profile follow you across devices. Optional — the app works without it.">
      <button
        type="button"
        onClick={() => void signInWithGoogle()}
        disabled={isWorking}
        className={`${buttonBase} bg-app-text text-app-surface hover:opacity-90`}
      >
        <GoogleLogo size={16} weight="bold" />
        Continue with Google
      </button>

      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-app-border" />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-app-text-muted">
          or
        </span>
        <div className="h-px flex-1 bg-app-border" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void signInWithEmail(emailInput)
        }}
        className="space-y-3"
      >
        <input
          type="email"
          required
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="w-full border border-app-border bg-app-surface-alt px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        />
        <button
          type="submit"
          disabled={isWorking || emailInput.trim().length === 0}
          className={`${buttonBase} text-app-text-muted hover:text-app-text`}
        >
          <EnvelopeSimple size={16} />
          Email me a sign-in link
        </button>
      </form>

      {notice ? (
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-app-text">
          {notice}
        </p>
      ) : null}
    </SectionShell>
  )
}
