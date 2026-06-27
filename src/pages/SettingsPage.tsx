// Settings page (Phase 7) — the user's profile + appearance preferences.
//
// Thin route component: it loads the profile via useProfile and renders the two
// sections. The ProfileSection is mounted only AFTER the profile has loaded, and
// keyed on the profile's identity, so its form seeds from the loaded values via
// useState initializers rather than a set-state-in-effect re-seed (same lesson as
// the create/edit modals). Appearance reads useUIStore directly and needs no load.

import { useProfile } from '@/core/hooks/useProfile'
import { ProfileSection } from '@/features/settings/ProfileSection'
import { AppearanceSection } from '@/features/settings/AppearanceSection'

export function SettingsPage() {
  const { profile, isLoading } = useProfile()

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-app-text">Settings</h1>
      <p className="mt-2 text-app-text-muted">
        Your profile and how LifeMap looks.
      </p>

      <div className="mt-6 space-y-6">
        {isLoading ? (
          <div className="rounded-app-lg border border-app-border bg-app-surface p-6">
            <p className="animate-pulse text-sm text-app-text-muted">
              Loading your profile...
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

        <AppearanceSection />
      </div>
    </section>
  )
}
