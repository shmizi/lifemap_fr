// readDocumentText — turn a user-picked file into plain text for distillation.
//
// Lives in core/utils (no React, no DB, no store). The only browser API it touches
// is File.text(), which keeps the whole upload path client-side: the document never
// leaves the machine as a file, only its distilled summary is ever persisted, and
// nothing hits the network until the digest call.
//
// TEXT FORMATS ONLY, deliberately. Every format here is decodable with zero
// dependencies. PDF and DOCX would each need a parser (pdf.js, mammoth) — real
// bundle weight for a feature most uploads don't need, so they are refused with an
// explanation that names the workaround rather than failing opaquely. Adding one
// later means a dynamic import in extractText() and a new entry in ACCEPTED; no
// caller above this changes.

// Extensions we can decode. Kept as extensions rather than MIME types because
// browsers report inconsistent (and often empty) types for .md and .csv.
const ACCEPTED = ['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.rtf'] as const

// The `accept` attribute for the file input, derived so the picker and the guard
// below can never disagree.
export const ACCEPTED_DOCUMENT_TYPES = ACCEPTED.join(',')

// Upper bound on what we will read into memory and hand to the model. Well past a
// long syllabus, far short of anything that would stall the tab or blow the request.
// Text beyond this is truncated (not rejected) — the front of a document carries
// its structure, so a truncated distillation is still useful.
export const MAX_DOCUMENT_CHARS = 200_000

// Refused files explain themselves in the UI, so the failure names a next step
// instead of a rule.
export class UnsupportedDocumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedDocumentError'
  }
}

export interface ExtractedDocument {
  name: string
  text: string
  // Length BEFORE truncation, so the UI can say what was condensed.
  originalChars: number
  truncated: boolean
}

function hasAcceptedExtension(name: string): boolean {
  const lower = name.toLowerCase()
  return ACCEPTED.some((ext) => lower.endsWith(ext))
}

export async function readDocumentText(file: File): Promise<ExtractedDocument> {
  if (!hasAcceptedExtension(file.name)) {
    throw new UnsupportedDocumentError(
      'That file type can’t be read yet — text files work (.txt, .md, .csv). For a PDF or Word doc, copy the text out and paste it into the notes below.',
    )
  }

  const raw = await file.text()
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    throw new UnsupportedDocumentError('That file looks empty.')
  }

  return {
    name: file.name,
    text: trimmed.slice(0, MAX_DOCUMENT_CHARS),
    originalChars: trimmed.length,
    truncated: trimmed.length > MAX_DOCUMENT_CHARS,
  }
}
