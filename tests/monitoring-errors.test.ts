import { describe, expect, it } from 'vitest'
import { sanitizeMonitoringError } from '@/lib/monitoring/errors'

describe('sanitizeMonitoringError', () => {
  it('extracts a plain Error message', () => {
    expect(sanitizeMonitoringError(new Error('Crawl timed out'))).toBe('Crawl timed out')
  })

  it('handles a plain string', () => {
    expect(sanitizeMonitoringError('Something failed')).toBe('Something failed')
  })

  it('falls back to a generic message for a non-Error, non-string value', () => {
    expect(sanitizeMonitoringError({ weird: true })).toBe('Unknown error')
  })

  it('NO SECRETS IN STORED ERROR TEXT: redacts an Authorization header value', () => {
    const result = sanitizeMonitoringError(new Error('Request failed: Authorization: Bearer sk_live_abcdef123456'))
    expect(result).not.toContain('sk_live_abcdef123456')
    expect(result).toContain('[redacted]')
  })

  it('redacts a bare bearer token even without an explicit header label', () => {
    const result = sanitizeMonitoringError(new Error('rejected token bearer abc.def.ghi'))
    expect(result).not.toContain('abc.def.ghi')
  })

  it('redacts an api_key= style query parameter', () => {
    const result = sanitizeMonitoringError(new Error('GET https://provider.example/send?api_key=topsecretvalue failed'))
    expect(result).not.toContain('topsecretvalue')
  })

  it('redacts a long hex-looking secret even with no obvious label', () => {
    const result = sanitizeMonitoringError(new Error(`key mismatch: ${'a1b2c3d4'.repeat(5)}`))
    expect(result).not.toContain('a1b2c3d4'.repeat(5))
  })

  it('collapses newlines/whitespace to a single line', () => {
    expect(sanitizeMonitoringError(new Error('line one\nline two\n\tline three'))).toBe('line one line two line three')
  })

  it('truncates a very long message', () => {
    const result = sanitizeMonitoringError(new Error('x'.repeat(1000)))
    expect(result.length).toBeLessThan(400)
    expect(result.endsWith('…')).toBe(true)
  })
})
