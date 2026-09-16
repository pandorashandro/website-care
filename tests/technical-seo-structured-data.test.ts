import { describe, expect, it } from 'vitest'
import { analyzeStructuredData } from '@/lib/technical-seo/checks/structured-data'
import { makeEvidence, makePage } from './helpers/technical-seo-fixtures'

describe('analyzeStructuredData', () => {
  it('flags a page with invalid JSON-LD', () => {
    const evidence = makeEvidence({
      pages: [makePage({ url: 'https://example.com/a', structured_data_present: true, structured_data_valid: false, structured_data_error: 'Unexpected token' })],
    })
    const findings = analyzeStructuredData(evidence)
    const finding = findings.find((f) => f.checkKey === 'structured_data_invalid')
    expect(finding).toBeDefined()
    expect(finding?.affectedPages[0].currentState?.value).toBe('Unexpected token')
  })

  it('does not flag a page with valid structured data', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/a', structured_data_present: true, structured_data_valid: true })] })
    expect(analyzeStructuredData(evidence)).toEqual([])
  })

  it('does not flag a page with no structured data at all — most sites never use it, and that is not itself a finding', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/a', structured_data_present: false, structured_data_valid: null })] })
    expect(analyzeStructuredData(evidence)).toEqual([])
  })

  it('does not evaluate a page that was never successfully crawled', () => {
    const evidence = makeEvidence({
      pages: [makePage({ url: 'https://example.com/a', status: 'failed', structured_data_present: true, structured_data_valid: false, http_status: null })],
    })
    expect(analyzeStructuredData(evidence)).toEqual([])
  })
})
