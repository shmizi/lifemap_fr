// useColophon — resolve the "Vol. YY · Ed. n" string from the best source available.
//
// Signed in (ADR-0003 step 1): the account profile carries the REAL edition ordinal
// and join year assigned server-side, so the colophon is authoritative. Signed out
// or in a build without accounts: fall back to the local profile's createdAt with
// the default edition of 1 — exactly the pre-auth behaviour. Callers pass their
// already-loaded local createdAt so this hook adds no extra profile read.

import { useAuthStore } from '@/store/useAuthStore'
import { registryColophon } from '@/core/utils/colophon'

export function useColophon(localCreatedAt?: string): string {
  const account = useAuthStore((s) => s.profile)
  return account
    ? registryColophon(account.joinedYear, account.edition)
    : registryColophon(localCreatedAt)
}
