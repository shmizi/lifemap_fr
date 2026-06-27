// ProfileSection — the Settings form for the user's profile (name, available
// hours/day, timezone). Local form state; the single write goes through the
// store's saveProfile action (which persists via the repository) — this component
// never touches the database.
//
// SEEDING: the parent (SettingsPage) mounts this only AFTER the profile has
// loaded, and keys it on the profile's identity, so the useState initializers seed
// straight from the `profile` prop (or sensible defaults for a first-time setup) —
// no set-state-in-effect re-seed. A save bumps the key, remounting with the saved
// values, which doubles as the "fields now reflect what's stored" confirmation.

import { useState, type ReactNode } from 'react'
import type { UserProfile } from '@/core/types'
import { DEFAULT_USER_PROFILE } from '@/core/constants'
import { useAppStore } from '@/store/useAppStore'

interface ProfileSectionProps {
  // The loaded profile, or null when none has been saved yet (first-time setup).
  profile: UserProfile | null
}

const inputClass =
  'w-full rounded-app-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'

// The IANA timezone list, read once from the platform. Guarded access keeps it
// typed (no `any`) and falls back to the detected zone if the runtime lacks
// Intl.supportedValuesOf.
function listTimezones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: 'timeZone') => string[]
  }
  if (typeof intl.supportedValuesOf === 'function') {
    return intl.supportedValuesOf('timeZone')
  }
  return [Intl.DateTimeFormat().resolvedOptions().timeZone]
}

const TIMEZONES = listTimezones()

export function ProfileSection({ profile }: ProfileSectionProps) {
  const saveProfile = useAppStore((s) => s.saveProfile)

  const [name, setName] = useState(profile?.name ?? '')
  const [hours, setHours] = useState(
    String(profile?.availableHoursPerDay ?? DEFAULT_USER_PROFILE.availableHoursPerDay),
  )
  const [timezone, setTimezone] = useState(
    profile?.timezone ?? DEFAULT_USER_PROFILE.timezone,
  )
  const [isSaving, setIsSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  const canSave = name.trim().length > 0 && !isSaving

  // Clamp the entered hours to a sane day: a blank or non-positive value falls
  // back to the gentle default, and nothing above 24 is meaningful.
  function resolveHours(): number {
    const parsed = Number.parseInt(hours, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_USER_PROFILE.availableHoursPerDay
    }
    return Math.min(parsed, 24)
  }

  async function handleSave() {
    if (!canSave) return
    setIsSaving(true)
    setJustSaved(false)
    try {
      await saveProfile({
        name: name.trim(),
        availableHoursPerDay: resolveHours(),
        timezone,
      })
      setJustSaved(true)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="rounded-app-lg border border-app-border bg-app-surface p-6">
      <h2 className="text-base font-semibold text-app-text">Profile</h2>
      <p className="mt-1 text-sm text-app-text-muted">
        Who you are and how much time you have — used to personalise your plan.
      </p>

      <div className="mt-5 space-y-4">
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setJustSaved(false)
            }}
            placeholder="What should we call you?"
            className={inputClass}
          />
        </Field>

        <Field label="Hours available per day">
          <input
            type="number"
            min={1}
            max={24}
            value={hours}
            onChange={(e) => {
              setHours(e.target.value)
              setJustSaved(false)
            }}
            placeholder={String(DEFAULT_USER_PROFILE.availableHoursPerDay)}
            className={inputClass}
          />
        </Field>

        <Field label="Timezone">
          <select
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value)
              setJustSaved(false)
            }}
            className={inputClass}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        {justSaved ? (
          <span className="text-sm text-app-text-muted">Saved</span>
        ) : null}
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        >
          {isSaving ? 'Saving...' : 'Save profile'}
        </button>
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-app-text">
        {label}
      </span>
      {children}
    </label>
  )
}
