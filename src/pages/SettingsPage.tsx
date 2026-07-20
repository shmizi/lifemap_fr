// Settings page (Phase 7) — the user's profile + appearance preferences.
//
// Thin route component: it loads the profile via useProfile and renders the two
// sections. The ProfileSection is mounted only AFTER the profile has loaded, and
// keyed on the profile's identity, so its form seeds from the loaded values via
// useState initializers rather than a set-state-in-effect re-seed (same lesson as
// the create/edit modals). Appearance reads useUIStore directly and needs no load.

import { useProfile } from '@/core/hooks/useProfile'
import { useUserContext } from '@/core/hooks/useUserContext'
import { ProfileSection } from '@/features/settings/ProfileSection'
import { UserContextSection } from '@/features/settings/UserContextSection'
import { AppearanceSection } from '@/features/settings/AppearanceSection'
import { RemindersSection } from '@/features/settings/RemindersSection'
import { AccountSection } from '@/features/settings/AccountSection'
import { RegistryPage } from '@/components/ui/Registry'

export function SettingsPage() {
  const { profile, isLoading } = useProfile()
  const { userContext, isLoading: isLoadingContext } = useUserContext()

  return (
    <RegistryPage
      kicker="LifeMap — Colophon"
      title="Settings"
      subtitle="Your profile and how LifeMap looks"
    >
      <div className="space-y-6">
        {isLoading ? (
          <div className="border border-app-border bg-app-surface p-6">
            <p className="animate-pulse font-mono text-[11px] uppercase tracking-[0.16em] text-app-text-muted">
              Loading your profile…
            </p>
          </div>
        ) : (
          // No key: the form mounts fresh when the load finishes (the isLoading
          // branch flip), seeding from the loaded profile via useState
          // initializers. It then OWNS its state — a save updates the store but
          // must not remount the form (that would wipe the "Saved" confirmation
          // and discard the values the user is looking at).
          <ProfileSection profile={profile} />
        )}

        {isLoadingContext ? (
          <div className="border border-app-border bg-app-surface p-6">
            <p className="animate-pulse font-mono text-[11px] uppercase tracking-[0.16em] text-app-text-muted">
              Loading your context…
            </p>
          </div>
        ) : (
          // Same "mount after load" pattern as ProfileSection: the form seeds from
          // the loaded context via useState initializers, then owns its own state.
          <UserContextSection context={userContext} />
        )}

        <AccountSection />

        <AppearanceSection />

        <RemindersSection />
      </div>
    </RegistryPage>
  )
}
