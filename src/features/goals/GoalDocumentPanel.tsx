// GoalDocumentPanel — attach a reference document to a goal (syllabus, job spec,
// training plan) so every AI generation plans around what it actually requires.
//
// The document is read in the browser, distilled ONCE through the provider, and
// only the summary is stored — so it costs one call on upload and nothing on every
// later generation. The panel shows that summary back, because a user who attaches
// a document deserves to see what the app actually took from it rather than trusting
// an invisible transform.
//
// Data flow is the usual one: it never touches a repository or a provider directly,
// only useContextStore. The parent mounts it with key={goalId} so each goal gets a
// fresh load.

import { useEffect, useRef, useState } from 'react'
import { FileText, Upload, X } from 'lucide-react'
import type { ID, SourceDocument } from '@/core/types'
import { useContextStore } from '@/store/useContextStore'
import {
  ACCEPTED_DOCUMENT_TYPES,
  UnsupportedDocumentError,
} from '@/core/utils/readDocumentText'

interface GoalDocumentPanelProps {
  goalId: ID
  goalTitle: string
  goalDescription?: string
}

export function GoalDocumentPanel({
  goalId,
  goalTitle,
  goalDescription,
}: GoalDocumentPanelProps) {
  const fetchGoalContext = useContextStore((s) => s.fetchGoalContext)
  const attachGoalDocument = useContextStore((s) => s.attachGoalDocument)
  const clearGoalDocument = useContextStore((s) => s.clearGoalDocument)

  const [doc, setDoc] = useState<SourceDocument | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    void fetchGoalContext(goalId)
      .then((ctx) => {
        if (active) setDoc(ctx?.sourceDocument ?? null)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [goalId, fetchGoalContext])

  async function handleFile(file: File) {
    setIsBusy(true)
    setError(null)
    setNote(null)
    try {
      const saved = await attachGoalDocument(goalId, file, {
        title: goalTitle,
        description: goalDescription,
      })
      if (saved) setDoc(saved)
      // Parsed to nothing usable — say so plainly rather than attaching an empty
      // document that would put a dead line in every future prompt.
      else setNote("Couldn't find anything plannable in that file.")
    } catch (e) {
      setError(
        e instanceof UnsupportedDocumentError
          ? e.message
          : 'Could not read that document just now. Please try again.',
      )
    } finally {
      setIsBusy(false)
      // Let the same file be re-picked after a failure.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemove() {
    setIsBusy(true)
    setError(null)
    setNote(null)
    try {
      await clearGoalDocument(goalId)
      setDoc(null)
    } catch {
      setError('Could not remove it just now. Please try again.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section className="mt-4 border border-app-border bg-app-surface-alt p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-app-text">
          Reference document
        </h2>
        {doc && !isBusy ? (
          <button
            type="button"
            onClick={handleRemove}
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-app-text-muted transition hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
          >
            <X size={12} aria-hidden />
            Remove
          </button>
        ) : null}
      </div>
      <div className="mt-2 border-t border-app-border" />

      {doc ? (
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-sm text-app-text">
            <FileText size={14} aria-hidden className="shrink-0 text-app-text-muted" />
            <span className="font-medium">{doc.name}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-app-text-muted">
              condensed from {doc.originalChars.toLocaleString()} chars
            </span>
          </p>
          {/* Show what was actually kept — the user should never have to guess
              what the AI is planning against. */}
          <pre className="mt-2 whitespace-pre-wrap border border-app-border bg-app-surface px-3 py-2 font-sans text-xs leading-relaxed text-app-text-muted">
            {doc.summary}
          </pre>
          <p className="mt-2 text-xs text-app-text-muted">
            Every plan for this goal is generated against these requirements.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-app-text-muted">
          Attach a syllabus, job description, or training plan and its requirements
          are folded into every plan generated for this goal. Text files
          (.txt, .md, .csv) — for a PDF, paste the text into the notes below.
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_DOCUMENT_TYPES}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isBusy}
        className="mt-3 inline-flex items-center gap-1.5 border border-app-border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-app-text transition hover:bg-app-surface disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
      >
        <Upload size={14} aria-hidden />
        {isBusy ? 'Reading…' : doc ? 'Replace document' : 'Attach document'}
      </button>

      {isBusy ? (
        <p className="mt-2 animate-pulse text-xs text-app-text-muted">
          Reading it once and keeping only what shapes the plan…
        </p>
      ) : null}
      {note ? <p className="mt-2 text-xs text-app-text-muted">{note}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </section>
  )
}
