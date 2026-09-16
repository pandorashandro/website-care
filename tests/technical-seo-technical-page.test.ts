import { describe, expect, it } from 'vitest'
import { analyzeTechnicalPageSignals } from '@/lib/technical-seo/checks/technical-page'
import { makeEvidence, makePage } from './helpers/technical-seo-fixtures'

describe('analyzeTechnicalPageSignals', () => {
  it('flags a successful page with almost no body and no extracted title/heading', () => {
    const evidence = makeEvidence({
      pages: [makePage({ url: 'https://example.com/blank', title: null, h1_text: null, response_size_bytes: 120 })],
    })
    const findings = analyzeTechnicalPageSignals(evidence)
    expect(findings.find((f) => f.checkKey === 'empty_or_tiny_page')).toBeDefined()
  })

  it('does not flag a small page that still has a title and heading', () => {
    const evidence = makeEvidence({
      pages: [makePage({ url: 'https://example.com/small-but-real', title: 'A small page', h1_text: 'Hello', response_size_bytes: 300 })],
    })
    expect(analyzeTechnicalPageSignals(evidence)).toEqual([])
  })

  it('does not flag an ordinary-sized page with no title/heading extracted purely because it is not tiny', () => {
    const evidence = makeEvidence({
      pages: [makePage({ url: 'https://example.com/normal', title: null, h1_text: null, response_size_bytes: 50_000 })],
    })
    expect(analyzeTechnicalPageSignals(evidence)).toEqual([])
  })

  it('does not evaluate a non-HTML resource', () => {
    const evidence = makeEvidence({
      pages: [makePage({ url: 'https://example.com/file.pdf', content_type: 'application/pdf', title: null, h1_text: null, response_size_bytes: 100 })],
    })
    expect(analyzeTechnicalPageSignals(evidence)).toEqual([])
  })

  it('produces no findings for a normal page (false-positive boundary)', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/' })] })
    expect(analyzeTechnicalPageSignals(evidence)).toEqual([])
  })
})
