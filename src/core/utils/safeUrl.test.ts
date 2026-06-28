import { describe, expect, it } from 'vitest'
import { safeExternalUrl } from './safeUrl'

describe('safeExternalUrl', () => {
  it('passes http and https web links through unchanged', () => {
    expect(safeExternalUrl('https://example.com/internship')).toBe(
      'https://example.com/internship',
    )
    expect(safeExternalUrl('http://example.org')).toBe('http://example.org')
  })

  it('trims surrounding whitespace before validating', () => {
    expect(safeExternalUrl('  https://example.com  ')).toBe('https://example.com')
  })

  it('rejects dangerous schemes that would execute on click', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(safeExternalUrl('JavaScript:alert(1)')).toBeNull()
    expect(safeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeExternalUrl('vbscript:msgbox(1)')).toBeNull()
  })

  it('rejects blank and scheme-less (relative) values', () => {
    expect(safeExternalUrl('')).toBeNull()
    expect(safeExternalUrl('   ')).toBeNull()
    expect(safeExternalUrl('example.com/path')).toBeNull()
    expect(safeExternalUrl('/just/a/path')).toBeNull()
  })
})
