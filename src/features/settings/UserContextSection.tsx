// UserContextSection — the Settings form for the standing AI-tailoring context
// (Phase 9): situation, days off, when/how you work, and a free-text "about you".
// The basics (name / hours / timezone) live in ProfileSection, not here.
//
// Local form state; the single write goes through useContextStore.saveUserContext
// (which persists via the repository) — this component never touches the database.
//
// SEEDING: the parent (SettingsPage) mounts this only AFTER the context has loaded
// and keys it on the context's identity, so the useState initializers seed straight
// from the `context` prop (or DEFAULT_USER_CONTEXT for a first-time setup) — no
// set-state-in-effect re-seed, the same lesson as ProfileSection.

import { useState, type ReactNode } from 'react'
import type {
  UserContext,
  LifeSituation,
  TimeOfDay,
  WorkRhythm,
} from '@/core/types'
import {
  DEFAULT_USER_CONTEXT,
  LIFE_SITUATION_OPTIONS,
  TIME_OF_DAY_OPTIONS,
  WORK_RHYTHM_OPTIONS,
  WEEKDAY_LABELS,
} from '@/core/constants'
import { useContextStore } from '@/store/useContextStore'

interface UserContextSectionProps {
  // The loaded context, or null when none has been saved yet.
  context: UserContext | null
}

const inputClass =
  'w-full rounded-app-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'

export function UserContextSection({ context }: UserContextSectionProps) {
  const saveUserContext = useContextStore((s) => s.saveUserContext)

  const [situation, setSituation] = useState<LifeSituation>(
    context?.situation ?? DEFAULT_USER_CONTEXT.situation,
  )
  const [situationDetail, setSituationDetail] = useState(
    context?.situationDetail ?? '',
  )
  const [lightDays, setLightDays] = useState<number[]>(
    context?.lightDays ?? DEFAULT_USER_CONTEXT.lightDays,
  )
  const [bestTimeOfDay, setBestTimeOfDay] = useState<TimeOfDay>(
    context?.bestTimeOfDay ?? DEFAULT_USER_CONTEXT.bestTimeOfDay,
  )
  const [workRhythm, setWorkRhythm] = useState<WorkRhythm>(
    context?.workRhythm ?? DEFAULT_USER_CONTEXT.workRhythm,
  )
  const [about, setAbout] = useState(context?.about ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  function toggleLightDay(index: number) {
    setJustSaved(false)
    setLightDays((days) =>
      days.includes(index)
        ? days.filter((d) => d !== index)
        : [...days, index].sort((a, b) => a - b),
    )
  }

  async function handleSave() {
    if (isSaving) return
    setIsSaving(true)
    setJustSaved(false)
    try {
      await saveUserContext({
        situation,
        situationDetail: situationDetail.trim() || undefined,
        lightDays,
        bestTimeOfDay,
        workRhythm,
        about: about.trim() || undefined,
      })
      setJustSaved(true)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="rounded-app-lg border border-app-border bg-app-surface p-6">
      <h2 className="text-base font-semibold text-app-text">About you</h2>
      <p className="mt-1 text-sm text-app-text-muted">
        Context the AI uses to tailor your roadmaps to how you actually live.
      </p>

      <div className="mt-5 space-y-4">
        <Field label="What mostly fills your days?">
          <select
            value={situation}
            onChange={(e) => {
              setSituation(e.target.value as LifeSituation)
              setJustSaved(false)
            }}
            className={inputClass}
          >
            {LIFE_SITUATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="More detail (optional)">
          <input
            type="text"
            value={situationDetail}
            onChange={(e) => {
              setSituationDetail(e.target.value)
              setJustSaved(false)
            }}
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
            onChange={(e) => {
              setBestTimeOfDay(e.target.value as TimeOfDay)
              setJustSaved(false)
            }}
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
            onChange={(e) => {
              setWorkRhythm(e.target.value as WorkRhythm)
              setJustSaved(false)
            }}
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
            onChange={(e) => {
              setAbout(e.target.value)
              setJustSaved(false)
            }}
            rows={3}
            placeholder="Strengths, constraints, things you've already achieved..."
            className={`${inputClass} resize-none`}
          />
        </Field>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        {justSaved ? (
          <span className="text-sm text-app-text-muted">Saved</span>
        ) : null}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        >
          {isSaving ? 'Saving...' : 'Save'}
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
