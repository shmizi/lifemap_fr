// OnboardingGate — decides whether to show the first-run onboarding flow.
//
// Rendered once, app-wide, from AppLayout (alongside the ErrorBanner). It loads
// the standing user context (and the profile, to seed name/hours) and shows the
// OnboardingChat ONLY when no context has been saved yet. Once the user finishes
// (or skips — both persist a context row), isUserContextSetup flips true and this
// renders nothing.
//
// It waits for the loads to finish before deciding (the context store's loading
// flag starts true) so the flow never flashes for a returning user. It is keyed on
// the loaded profile so it re-seeds if the profile resolves a beat after first
// paint — the same "mount the form after load" pattern Settings uses.

import { useUserContext } from '@/core/hooks/useUserContext'
import { useProfile } from '@/core/hooks/useProfile'
import { OnboardingChat } from '@/features/onboarding/OnboardingChat'

export function OnboardingGate() {
  const { isSetup, isLoading: isLoadingContext } = useUserContext()
  const { profile, isLoading: isLoadingProfile } = useProfile()

  // Don't decide until both reads have resolved (avoids a first-run flash).
  if (isLoadingContext || isLoadingProfile) return null
  // Already onboarded — nothing to show.
  if (isSetup) return null

  return <OnboardingChat key={profile?.updatedAt ?? 'new'} profile={profile} />
}
