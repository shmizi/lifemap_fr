// The registry colophon string: "Vol. <YY> · Ed. <n>".
//
// The magazine conceit: every user is their own EDITION of a yearly VOLUME.
//   Volume  = the two-digit year the user joined (e.g. 2026 -> "26"), fixed at
//             signup like a printed volume's year.
//   Edition = the user's signup ordinal (the Nth person to join) — so the first
//             user of 2026 is "Vol. 26 · Ed. 1", the 30th of 2027 is "Vol. 27 · Ed. 30".
//
// The ordinal isn't knowable in this local-first build (there's no server counting
// signups), so `edition` defaults to 1 until a backend assigns and persists the
// real number at go-live. Volume comes from the profile's createdAt when present,
// otherwise the current year (pre-onboarding).
export function registryColophon(joinedAt?: string, edition = 1): string {
  const year = joinedAt ? new Date(joinedAt).getFullYear() : new Date().getFullYear()
  return `Vol. ${String(year).slice(-2)} · Ed. ${edition}`
}
