// OnboardingChat — the first-run "get to know you" flow, as a guided chat.
//
// Replaces the old single-form OnboardingModal (Phase 10). Same job — collect the
// few things that let the AI tailor roadmaps to THIS person and write them to the
// profile (name + hours) and the standing UserContext (situation, days off, focus
// time, rhythm, a free-text "about") — but delivered as a warm, ONE-QUESTION-PER-
// SCREEN conversation instead of a wall of fields. It only asks; it is NOT an AI
// chat (no provider call, no cost on first run) — the coach's lines are scripted and
// the answers use structured inputs, so it is fully reliable. The parsing-heavy,
// adaptive AI version is a deliberate future option.
//
// SEEDING mirrors the old modal: mounted by OnboardingGate only once profile +
// context have loaded, so the initial answers seed straight from the loaded profile
// (a returning user who set a name in Settings) or gentle defaults. "Skip setup" and
// finishing both persist a context row, which flips isUserContextSetup so the gate
// stops showing; everything stays editable later in Settings.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, Sparkles } from 'lucide-react'
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

interface OnboardingChatProps {
  // The loaded profile, or null if none saved yet — seeds name/hours only.
  profile: UserProfile | null
}

// The answers gathered across the flow. Kept as loose strings for the free-text /
// number steps (resolved at persist) and typed values for the closed choices.
interface Answers {
  name: string
  hours: string
  situation: LifeSituation
  situationDetail: string
  lightDays: number[]
  bestTimeOfDay: TimeOfDay
  workRhythm: WorkRhythm
  about: string
}

type StepId = keyof Answers
type StepKind = 'text' | 'number' | 'single' | 'weekdays' | 'textarea'

interface Step {
  id: StepId
  kind: StepKind
  // The coach's line for this beat.
  prompt: string
  // Optional steps show "Skip" instead of "Continue" when left blank.
  optional?: boolean
  placeholder?: string
  options?: ReadonlyArray<{ value: string; label: string }>
}

// The scripted conversation, in order. One question per screen — the app's guiding
// principle. Single-choice steps auto-advance on pick (it reads like answering in a
// chat); the rest use Continue.
const STEPS: readonly Step[] = [
  {
    id: 'name',
    kind: 'text',
    prompt: "First things first — what should I call you?",
    optional: true,
    placeholder: 'Your name',
  },
  {
    id: 'hours',
    kind: 'number',
    prompt:
      'On a typical day, how many hours can you realistically give to your goals?',
    placeholder: String(DEFAULT_USER_PROFILE.availableHoursPerDay),
  },
  {
    id: 'situation',
    kind: 'single',
    prompt: 'What mostly fills your days right now?',
    options: LIFE_SITUATION_OPTIONS,
  },
  {
    id: 'situationDetail',
    kind: 'text',
    prompt: 'Want to tell me a little more about that?',
    optional: true,
    placeholder: 'e.g. final-year CS student, part-time job',
  },
  {
    id: 'lightDays',
    kind: 'weekdays',
    prompt: 'Which days tend to be lighter, or off, for you? Pick any — or none.',
  },
  {
    id: 'bestTimeOfDay',
    kind: 'single',
    prompt: 'When do you focus best?',
    options: TIME_OF_DAY_OPTIONS,
  },
  {
    id: 'workRhythm',
    kind: 'single',
    prompt: 'And how do you like to work?',
    options: WORK_RHYTHM_OPTIONS,
  },
  {
    id: 'about',
    kind: 'textarea',
    prompt:
      "Last one — anything else I should know about you? Strengths, constraints, wins so far.",
    optional: true,
    placeholder: "Anything that would help me plan around the real you…",
  },
]

export function OnboardingChat({ profile }: OnboardingChatProps) {
  const saveProfile = useAppStore((s) => s.saveProfile)
  const saveUserContext = useContextStore((s) => s.saveUserContext)

  const [answers, setAnswers] = useState<Answers>({
    name: profile?.name ?? '',
    hours: String(
      profile?.availableHoursPerDay ?? DEFAULT_USER_PROFILE.availableHoursPerDay,
    ),
    situation: DEFAULT_USER_CONTEXT.situation,
    situationDetail: '',
    lightDays: DEFAULT_USER_CONTEXT.lightDays,
    bestTimeOfDay: DEFAULT_USER_CONTEXT.bestTimeOfDay,
    workRhythm: DEFAULT_USER_CONTEXT.workRhythm,
    about: '',
  })
  // 0..STEPS.length; the last index (=== length) is the wrap-up screen.
  const [step, setStep] = useState(0)
  const [isSaving, setIsSaving] = useState(false)

  // Keep the newest bubble in view as the conversation grows.
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [step])

  const isFinish = step >= STEPS.length
  const current = isFinish ? null : STEPS[step]

  function set<K extends StepId>(id: K, value: Answers[K]) {
    setAnswers((a) => ({ ...a, [id]: value }))
  }

  const advance = () => setStep((s) => Math.min(STEPS.length, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  function toggleLightDay(index: number) {
    setAnswers((a) => ({
      ...a,
      lightDays: a.lightDays.includes(index)
        ? a.lightDays.filter((d) => d !== index)
        : [...a.lightDays, index].sort((x, y) => x - y),
    }))
  }

  // Clamp entered hours to a sane day (1..24), falling back to the gentle default.
  function resolveHours(): number {
    const parsed = Number.parseInt(answers.hours, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_USER_PROFILE.availableHoursPerDay
    }
    return Math.min(parsed, 24)
  }

  // The single persist path — both "Start mapping" and "Skip setup" call it with
  // whatever has been entered so far. Writing a context row flips the gate off.
  async function persist() {
    if (isSaving) return
    setIsSaving(true)
    try {
      await saveProfile({
        name: answers.name.trim(),
        availableHoursPerDay: resolveHours(),
        timezone: profile?.timezone ?? DEFAULT_USER_PROFILE.timezone,
      })
      await saveUserContext({
        situation: answers.situation,
        situationDetail: answers.situationDetail.trim() || undefined,
        lightDays: answers.lightDays,
        bestTimeOfDay: answers.bestTimeOfDay,
        workRhythm: answers.workRhythm,
        about: answers.about.trim() || undefined,
      })
    } finally {
      setIsSaving(false)
    }
  }

  const firstName = answers.name.trim().split(/\s+/)[0]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-app-surface">
      {/* Top bar: progress + an ever-present escape hatch. */}
      <div className="flex items-center justify-between gap-4 border-b border-app-border px-5 py-3">
        <div className="flex items-center gap-2 text-app-text">
          <Sparkles size={16} aria-hidden />
          <span className="text-sm font-semibold">Let&rsquo;s get to know you</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-app-text-muted">
            {Math.min(step + 1, STEPS.length)} of {STEPS.length}
          </span>
          <button
            type="button"
            onClick={() => void persist()}
            disabled={isSaving}
            className="rounded-app-lg px-2.5 py-1 text-xs font-medium text-app-text-muted transition hover:text-app-text disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          >
            Skip setup
          </button>
        </div>
      </div>

      {/* Conversation transcript. */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-lg flex-col gap-4 px-5 py-8">
          <CoachBubble>
            Hi{firstName ? ` ${firstName}` : ''} — I&rsquo;m your planning coach. A
            few quick questions so every plan I make actually fits your life. This
            takes a minute, and you can change anything later.
          </CoachBubble>

          {/* Answered beats: the coach's question + the user's reply. */}
          {STEPS.slice(0, Math.min(step, STEPS.length)).map((s) => (
            <div key={s.id} className="flex flex-col gap-4">
              <CoachBubble>{s.prompt}</CoachBubble>
              <UserBubble>{answerLabel(s, answers)}</UserBubble>
            </div>
          ))}

          {/* The current question + its input. */}
          {current ? (
            <div className="flex flex-col gap-4">
              <CoachBubble>{current.prompt}</CoachBubble>
              <StepInput
                step={current}
                answers={answers}
                onText={(v) => set(current.id as 'name', v as Answers['name'])}
                onSingle={(v) => {
                  // Commit the closed choice and move on — reads like a chat reply.
                  set(current.id as 'situation', v as LifeSituation)
                  advance()
                }}
                onToggleDay={toggleLightDay}
                onEnter={advance}
              />
            </div>
          ) : null}

          {/* Wrap-up. */}
          {isFinish ? (
            <CoachBubble>
              Perfect{firstName ? `, ${firstName}` : ''} — that&rsquo;s everything I
              need to tailor your plans. Let&rsquo;s map your first goal.
            </CoachBubble>
          ) : null}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Footer nav. */}
      <div className="border-t border-app-border px-5 py-4">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={back}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-app-lg px-3 py-2 text-sm text-app-text-muted transition hover:text-app-text disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              <ArrowLeft size={15} aria-hidden />
              Back
            </button>
          ) : (
            <span />
          )}

          {isFinish ? (
            <button
              type="button"
              onClick={() => void persist()}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-app-lg bg-app-text px-5 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              <Check size={16} aria-hidden />
              {isSaving ? 'Saving…' : 'Start mapping'}
            </button>
          ) : current && current.kind !== 'single' ? (
            <button
              type="button"
              onClick={advance}
              className="inline-flex items-center gap-2 rounded-app-lg bg-app-text px-5 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              {current.optional && isBlank(current, answers) ? 'Skip' : 'Continue'}
            </button>
          ) : (
            // Single-choice steps advance on pick; offer a gentle keep-current path.
            <button
              type="button"
              onClick={advance}
              className="rounded-app-lg px-3 py-2 text-sm text-app-text-muted transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
            >
              Keep current
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Whether an optional step has been left blank (drives the Skip/Continue label).
function isBlank(step: Step, answers: Answers): boolean {
  const v = answers[step.id]
  return typeof v === 'string' && v.trim().length === 0
}

// The human-readable form of a step's answer, shown back in the transcript.
function answerLabel(step: Step, answers: Answers): string {
  switch (step.id) {
    case 'name':
      return answers.name.trim() || "I'll keep it casual"
    case 'hours': {
      const n = Number.parseInt(answers.hours, 10)
      const h = Number.isFinite(n) && n > 0 ? Math.min(n, 24) : DEFAULT_USER_PROFILE.availableHoursPerDay
      return `About ${h} hour${h === 1 ? '' : 's'} a day`
    }
    case 'situation':
      return labelOf(LIFE_SITUATION_OPTIONS, answers.situation)
    case 'situationDetail':
      return answers.situationDetail.trim() || 'Nothing to add'
    case 'lightDays':
      return answers.lightDays.length > 0
        ? answers.lightDays.map((i) => WEEKDAY_LABELS[i]).join(', ')
        : 'No lighter days'
    case 'bestTimeOfDay':
      return labelOf(TIME_OF_DAY_OPTIONS, answers.bestTimeOfDay)
    case 'workRhythm':
      return labelOf(WORK_RHYTHM_OPTIONS, answers.workRhythm)
    case 'about':
      return answers.about.trim() || 'Nothing to add'
  }
}

function labelOf(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value
}

const inputClass =
  'w-full rounded-app-lg border border-app-border bg-app-surface-alt px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'

// The active step's input control. Kept dumb: it renders per `kind` and reports
// changes up; the parent owns all state and navigation.
function StepInput({
  step,
  answers,
  onText,
  onSingle,
  onToggleDay,
  onEnter,
}: {
  step: Step
  answers: Answers
  onText: (value: string) => void
  onSingle: (value: string) => void
  onToggleDay: (index: number) => void
  onEnter: () => void
}) {
  if (step.kind === 'single') {
    const selected = answers[step.id] as string
    return (
      <div className="flex flex-wrap gap-2 self-end">
        {step.options?.map((o) => {
          const active = o.value === selected
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onSingle(o.value)}
              aria-pressed={active}
              className={`rounded-app-lg border px-3.5 py-2 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30 ${
                active
                  ? 'border-app-text bg-app-text text-app-surface'
                  : 'border-app-border text-app-text hover:bg-app-border/30'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    )
  }

  if (step.kind === 'weekdays') {
    return (
      <div className="flex flex-wrap gap-2">
        {WEEKDAY_LABELS.map((label, index) => {
          const active = answers.lightDays.includes(index)
          return (
            <button
              key={label}
              type="button"
              onClick={() => onToggleDay(index)}
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
    )
  }

  if (step.kind === 'textarea') {
    return (
      <textarea
        autoFocus
        value={answers[step.id] as string}
        onChange={(e) => onText(e.target.value)}
        rows={3}
        placeholder={step.placeholder}
        className={`${inputClass} resize-none`}
      />
    )
  }

  // text / number
  return (
    <input
      autoFocus
      type={step.kind === 'number' ? 'number' : 'text'}
      min={step.kind === 'number' ? 1 : undefined}
      max={step.kind === 'number' ? 24 : undefined}
      value={answers[step.id] as string}
      onChange={(e) => onText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onEnter()
        }
      }}
      placeholder={step.placeholder}
      className={inputClass}
    />
  )
}

function CoachBubble({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[85%] self-start rounded-app-lg rounded-tl-sm bg-app-surface-alt px-4 py-2.5 text-sm text-app-text">
      {children}
    </div>
  )
}

function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[85%] self-end rounded-app-lg rounded-tr-sm bg-app-text px-4 py-2.5 text-sm text-app-surface">
      {children}
    </div>
  )
}
