// OnboardingModal — the first-run "tell us about you" flow (Phase 9).
//
// Collects the few things that let the AI tailor roadmaps to THIS person: the
// basics that live on the profile (name + hours/day; timezone is auto-detected)
// and the standing context fields (situation, days off, when/how they work, a
// free-text "about you"). On finish it writes BOTH the profile (useAppStore) and
// the standing context (useContextStore) — name/hours stay on the profile, never
// duplicated into the context row.
//
// SEEDING: mounted fresh by OnboardingGate only once both profile + context have
// loaded, so the useState initializers seed straight from the loaded profile (a
// returning user who set a name in Settings but never did onboarding) or sensible
// defaults — no set-state-in-effect re-seed. "Skip for now" (and the backdrop/X,
// which route to it) persists the current values with defaults so the gate does
// not nag again; everything is editable later in Settings.

import { useState, type ReactNode } from 'react'
import type {
  UserProfile,
  LifeSituation,
  TimeOfDay,
  WorkRhythm,
} from '@/core/types'
import {
  DEFAULT_USER_PROFILE,
  DEFAULT_USER_CONTEXT,
  LIFE_SITUATION_OPTIONS,
  TIME_OF_DAY_OPTIONS,
  WORK_RHYTHM_OPTIONS,
  WEEKDAY_LABELS,
} from '@/core/constants'
import { useAppStore } from '@/store/useAppStore'
import { useContextStore } from '@/store/useContextStore'
import { Modal } from '@/components/ui/Modal'

interface OnboardingModalProps {
  // The loaded profile, or null if none saved yet — used only to seed name/hours.
  profile: UserProfile | null
}

const inputClass =
  'w-full rounded-app-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'

export function OnboardingModal({ profile }: OnboardingModalProps) {
  const saveProfile = useAppStore((s) => s.saveProfile)
  const saveUserContext = useContextStore((s) => s.saveUserContext)

  const [name, setName] = useState(profile?.name ?? '')
  const [hours, setHours] = useState(
    String(profile?.availableHoursPerDay ?? DEFAULT_USER_PROFILE.availableHoursPerDay),
  )
  const [situation, setSituation] = useState<LifeSituation>(
    DEFAULT_USER_CONTEXT.situation,
  )
  const [situationDetail, setSituationDetail] = useState('')
  const [lightDays, setLightDays] = useState<number[]>(
    DEFAULT_USER_CONTEXT.lightDays,
  )
  const [bestTimeOfDay, setBestTimeOfDay] = useState<TimeOfDay>(
    DEFAULT_USER_CONTEXT.bestTimeOfDay,
  )
  const [workRhythm, setWorkRhythm] = useState<WorkRhythm>(
    DEFAULT_USER_CONTEXT.workRhythm,
  )
  const [about, setAbout] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  function toggleLightDay(index: number) {
    setLightDays((days) =>
      days.includes(index)
        ? days.filter((d) => d !== index)
        : [...days, index].sort((a, b) => a - b),
    )
  }

  // Clamp entered hours to a sane day (1..24), falling back to the gentle default.
  function resolveHours(): number {
    const parsed = Number.parseInt(hours, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_USER_PROFILE.availableHoursPerDay
    }
    return Math.min(parsed, 24)
  }

  // The single persist path. Both "Start mapping" and "Skip for now" call it with
  // whatever the user has entered so far — skipping just means accepting defaults.
  // Writing a context row (even a default one) flips isUserContextSetup, so the
  // gate stops showing. Timezone is auto-detected, not asked here.
  async function persist() {
    if (isSaving) return
    setIsSaving(true)
    try {
      await saveProfile({
        name: name.trim(),
        availableHoursPerDay: resolveHours(),
        timezone: profile?.timezone ?? DEFAULT_USER_PROFILE.timezone,
      })
      await saveUserContext({
        situation,
        situationDetail: situationDetail.trim() || undefined,
        lightDays,
        bestTimeOfDay,
        workRhythm,
        about: about.trim() || undefined,
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      isOpen
      onClose={() => void persist()}
      title="Welcome — let's set up your map"
      maxWidth="max-w-xl"
    >
      <p className="mt-1 text-sm text-app-text-muted">
        A few quick things so your roadmaps fit the way you actually live. You can
        change any of this later in Settings.
      </p>

      <div className="mt-5 space-y-4">
        <Field label="What should we call you?">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className={inputClass}
          />
        </Field>

        <Field label="Hours you can give on a typical day">
          <input
            type="number"
            min={1}
            max={24}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder={String(DEFAULT_USER_PROFILE.availableHoursPerDay)}
            className={inputClass}
          />
        </Field>

        <Field label="What mostly fills your days right now?">
          <select
            value={situation}
            onChange={(e) => setSituation(e.target.value as LifeSituation)}
            className={inputClass}
          >
            {LIFE_SITUATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Anything more about that? (optional)">
          <input
            type="text"
            value={situationDetail}
            onChange={(e) => setSituationDetail(e.target.value)}
            placeholder="e.g. final-year CS student, part-time job"
            className={inputClass}
          />
        </Field>

        <Field label="Lighter days / days off">
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((label, index) => {
              const active = lightDays.includes(index)
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleLightDay(index)}
                  aria-pressed={active}
                  className={`rounded-app-lg border px-3 py-1.5 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30 ${
                    active
                      ? 'border-app-text bg-app-text text-app-surface'
                      : 'border-app-border text-app-text hover:bg-app-border/30'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="When do you focus best?">
          <select
            value={bestTimeOfDay}
            onChange={(e) => setBestTimeOfDay(e.target.value as TimeOfDay)}
            className={inputClass}
          >
            {TIME_OF_DAY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="How do you like to work?">
          <select
            value={workRhythm}
            onChange={(e) => setWorkRhythm(e.target.value as WorkRhythm)}
            className={inputClass}
          >
            {WORK_RHYTHM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Anything the AI should know about you? (optional)">
          <textarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            rows={3}
            placeholder="Strengths, constraints, things you've already achieved..."
            className={`${inputClass} resize-none`}
          />
        </Field>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => void persist()}
          disabled={isSaving}
          className="rounded-app-lg border border-app-border px-4 py-2 text-sm font-medium text-app-text transition hover:bg-app-border/30 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={() => void persist()}
          disabled={isSaving}
          className="rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        >
          {isSaving ? 'Saving...' : 'Start mapping'}
        </button>
      </div>
    </Modal>
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
