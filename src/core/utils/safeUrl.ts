// safeExternalUrl — scheme-check a URL before it becomes a clickable href.
//
// WHY: opportunity URLs come from manual entry today and from a real web-search
// provider later. React does NOT block dangerous schemes in an href — a
// `javascript:` / `data:` / `vbscript:` URL renders verbatim and executes on
// click (a stored-XSS vector). So any URL that turns into an <a href> must be
// validated to an http(s) web link first; anything else yields null and the
// caller simply renders no link.
//
// Pure, no side effects — lives in core/utils per the architecture (no React, no
// DB). Returns the original (trimmed) string when safe, so the displayed/opened
// URL is exactly what was stored, with no normalisation surprises.

export function safeExternalUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null

  let parsed: URL
  try {
    // Absolute URLs only: a scheme-less value (e.g. "example.com") throws here,
    // which is correct — we never want to emit a relative href for an external link.
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    return trimmed
  }
  return null
}
