// AddOpportunityModal — manually add an opportunity the user found themselves
// (source: 'manual'). The same one-modal-per-entity convention as the goal/
// subgoal/task creation modals: local form state, a single write through a store
// action (saveOpportunity), never a repository.
//
// WHY manual-add exists before AI search: it lets the whole Discovery stack —
// scoring, persistence, the matched-goal display — be used and verified today,
// with no provider chosen and no API key. AI-found opportunities (source:
// 'ai_search') will flow through the SAME saveOpportunity path later.
//
// The store scores the candidate against the user's goals on save; this form only
// collects the descriptive fields. Tags are entered as a comma-separated string
// and split into the string[] the model stores.

import { useEffect, useState, type ReactNode } from 'react'
import type { OpportunityType } from '@/core/types'
import { OPPORTUNITY_TYPE_OPTIONS } from '@/core/constants'
import { useDiscoveryStore } from '@/store/useDiscoveryStore'
import { Modal } from '@/components/ui/Modal'

interface AddOpportunityModalProps {
  open: boolean
  onClose: () => void
}

const inputClass =
  'w-full rounded-app-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30'

// Split the comma-separated tag input into clean, de-duplicated tags.
function parseTags(raw: string): string[] {
  const seen = new Set<string>()
  for (const part of raw.split(',')) {
    const tag = part.trim()
    if (tag.length > 0) seen.add(tag)
  }
  return [...seen]
}

export function AddOpportunityModal({ open, onClose }: AddOpportunityModalProps) {
  const saveOpportunity = useDiscoveryStore((s) => s.saveOpportunity)

  const [type, setType] = useState<OpportunityType>(OPPORTUNITY_TYPE_OPTIONS[0].value)
  const [title, setTitle] = useState('')
  const [organization, setOrganization] = useState('')
  const [url, setUrl] = useState('')
  const [deadline, setDeadline] = useState('')
  const [location, setLocation] = useState('')
  const [tags, setTags] = useState('')
  const [description, setDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Re-seed (clear) the form every time the modal opens. Keyed on `open` only, so
  // typing is never clobbered by an unrelated re-render. Same pattern as the goal
  // creation modal.
  useEffect(() => {
    if (!open) return
    setType(OPPORTUNITY_TYPE_OPTIONS[0].value)
    setTitle('')
    setOrganization('')
    setUrl('')
    setDeadline('')
    setLocation('')
    setTags('')
    setDescription('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const canSave = title.trim().length > 0 && organization.trim().length > 0 && !isSaving

  function handleClose() {
    if (isSaving) return
    onClose()
  }

  async function handleSave() {
    if (!canSave) return
    setIsSaving(true)
    try {
      await saveOpportunity({
        type,
        title: title.trim(),
        organization: organization.trim(),
        description: description.trim(),
        url: url.trim(),
        // Optional fields: store undefined (not '') when blank, matching the model.
        deadline: deadline.length > 0 ? deadline : undefined,
        location: location.trim().length > 0 ? location.trim() : undefined,
        tags: parseTags(tags),
        source: 'manual',
      })
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={open} onClose={handleClose} title="Add an opportunity">
      <div className="mt-5 space-y-4">
        <Field label="Type">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as OpportunityType)}
            className={inputClass}
          >
            {OPPORTUNITY_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Title">
          <input
            autoFocus
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Summer ML Research Internship"
            className={inputClass}
          />
        </Field>

        <Field label="Organization">
          <input
            type="text"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="e.g. RWTH Aachen"
            className={inputClass}
          />
        </Field>

        <Field label="Link">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Deadline">
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Location">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Remote, Aachen, ..."
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Tags">
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="comma-separated, e.g. ML, Germany, paid"
            className={inputClass}
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What is this opportunity, in a sentence or two?"
            className={`${inputClass} resize-none`}
          />
        </Field>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={handleClose}
          className="rounded-app-lg border border-app-border px-4 py-2 text-sm font-medium text-app-text transition hover:bg-app-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="rounded-app-lg bg-app-text px-4 py-2 text-sm font-semibold text-app-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30"
        >
          {isSaving ? 'Saving...' : 'Add opportunity'}
        </button>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-app-text">{label}</span>
      {children}
    </label>
  )
}
