// The registry colophon string: "Vol. <YY> · Ed. <n>".
//
// The magazine conceit: every user is their own EDITION of a yearly VOLUME.
//   Volume  = the two-digit year the user joined (e.g. 2026 -> "26"), fixed at
//             signup like a printed volume's year.
//   Edition = the user's signup ordinal (the Nth person to join) — so the first
//             user of 2026 is "Vol. 26 · Ed. 1", the 30th of 2027 is "Vol. 27 · Ed. 30".
//
// The ordinal isn't knowable in the local-first build (there's no server counting
// signups), so `edition` defaults to 1 until the backend assigns and persists the
// real number at go-live (ADR-0003 step 1). Once signed in, the auth store supplies
// the real edition AND the join year, so `joinedAt` accepts either:
//   - a full year as a NUMBER (2026)      — the signed-in path (profiles.joined_year)
//   - an ISODate STRING ("2026-07-20…")   — the local path (profile.createdAt)
//   - undefined                            — pre-onboarding, falls back to this year
export function registryColophon(
  joinedAt?: string | number,
  edition = 1,
): string {
  const year =
    typeof joinedAt === 'number'
      ? joinedAt
      : joinedAt
        ? new Date(joinedAt).getFullYear()
        : new Date().getFullYear()
  return `Vol. ${String(year).slice(-2)} · Ed. ${edition}`
}
