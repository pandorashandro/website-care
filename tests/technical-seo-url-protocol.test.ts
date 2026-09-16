import { describe, expect, it } from 'vitest'
import { analyzeUrlProtocol } from '@/lib/technical-seo/checks/url-protocol'
import { makeEvidence, makePage, makeLink } from './helpers/technical-seo-fixtures'

describe('analyzeUrlProtocol', () => {
  it('flags an internal link to an insecure http:// URL on an HTTPS site', () => {
    const homepage = makePage({ url: 'https://example.com/', depth: 0 })
    const evidence = makeEvidence({ pages: [homepage], links: [makeLink({ source_page_id: homepage.id, target_url: 'http://example.com/legacy' })] })
    const findings = analyzeUrlProtocol(evidence)
    expect(findings.find((f) => f.checkKey === 'mixed_protocol_internal_links')).toBeDefined()
  })

  it('does not flag anything on a site whose own seed is served over HTTP', () => {
    const homepage = makePage({ url: 'http://example.com/', depth: 0 })
    const evidence = makeEvidence({ pages: [homepage], links: [makeLink({ source_page_id: homepage.id, target_url: 'http://example.com/legacy' })] })
    expect(analyzeUrlProtocol(evidence)).toEqual([])
  })

  it('produces no findings when every internal link uses https (false-positive boundary)', () => {
    const homepage = makePage({ url: 'https://example.com/', depth: 0 })
    const evidence = makeEvidence({ pages: [homepage], links: [makeLink({ source_page_id: homepage.id, target_url: 'https://example.com/about' })] })
    expect(analyzeUrlProtocol(evidence)).toEqual([])
  })

  it('ignores external links entirely', () => {
    const homepage = makePage({ url: 'https://example.com/', depth: 0 })
    const evidence = makeEvidence({
      pages: [homepage],
      links: [makeLink({ source_page_id: homepage.id, target_url: 'http://external.example/', link_type: 'external' })],
    })
    expect(analyzeUrlProtocol(evidence)).toEqual([])
  })
})
