import { describe, expect, it } from 'vitest'
import { adjustSeverity } from '@/lib/technical-seo/severity'

describe('adjustSeverity', () => {
  it('caps a low-confidence critical finding at medium', () => {
    expect(adjustSeverity('critical', 'low', 1, 10)).toBe('medium')
  })

  it('caps a low-confidence high finding at medium', () => {
    expect(adjustSeverity('high', 'low', 1, 10)).toBe('medium')
  })

  it('does not cap a low-confidence medium or low finding (nothing to cap)', () => {
    expect(adjustSeverity('medium', 'low', 1, 10)).toBe('medium')
    expect(adjustSeverity('low', 'low', 1, 10)).toBe('low')
  })

  it('escalates a widespread high finding to critical', () => {
    expect(adjustSeverity('high', 'high', 6, 10)).toBe('critical')
  })

  it('does not escalate a high finding affecting a small fraction of the site', () => {
    expect(adjustSeverity('high', 'high', 1, 10)).toBe('high')
  })

  it('never escalates medium or low findings regardless of spread (avoids severity inflation)', () => {
    expect(adjustSeverity('medium', 'high', 10, 10)).toBe('medium')
    expect(adjustSeverity('low', 'high', 10, 10)).toBe('low')
  })

  it('does not escalate or de-escalate a single-page critical finding just because it is isolated', () => {
    expect(adjustSeverity('critical', 'high', 1, 100)).toBe('critical')
  })

  it('treats zero analyzed pages as never "widespread" (no division by zero)', () => {
    expect(adjustSeverity('high', 'high', 0, 0)).toBe('high')
  })
})
