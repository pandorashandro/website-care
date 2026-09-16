import { describe, expect, it } from 'vitest'
import { analyzeSiteWideConsistency } from '@/lib/technical-seo/checks/site-wide'
import { makeEvidence, makePage } from './helpers/technical-seo-fixtures'

describe('analyzeSiteWideConsistency', () => {
  it('flags widespread non-indexability when a large share of crawled pages are noindex/blocked', () => {
    const pages = [
      ...Array.from({ length: 4 }, (_, i) => makePage({ url: `https://example.com/ok-${i}` })),
      ...Array.from({ length: 4 }, (_, i) => makePage({ url: `https://example.com/blocked-${i}`, noindex: true })),
    ]
    const evidence = makeEvidence({ pages })
    const findings = analyzeSiteWideConsistency(evidence)
    expect(findings.find((f) => f.checkKey === 'widespread_non_indexable_pages')).toBeDefined()
  })

  it('does not flag widespread non-indexability from too small a sample', () => {
    const pages = [makePage({ url: 'https://example.com/a' }), makePage({ url: 'https://example.com/b', noindex: true })]
    const evidence = makeEvidence({ pages })
    expect(analyzeSiteWideConsistency(evidence).find((f) => f.checkKey === 'widespread_non_indexable_pages')).toBeUndefined()
  })

  it('flags widespread fetch failures when a large share of attempted pages failed outright', () => {
    const pages = [
      ...Array.from({ length: 4 }, (_, i) => makePage({ url: `https://example.com/ok-${i}` })),
      ...Array.from({ length: 2 }, (_, i) => makePage({ url: `https://example.com/dead-${i}`, status: 'failed', error_reason: 'network', http_status: null })),
    ]
    const evidence = makeEvidence({ pages })
    expect(analyzeSiteWideConsistency(evidence).find((f) => f.checkKey === 'widespread_fetch_failures')).toBeDefined()
  })

  it('does not flag a healthy site as widespread-failing from one isolated failure among many pages', () => {
    const pages = [
      ...Array.from({ length: 9 }, (_, i) => makePage({ url: `https://example.com/ok-${i}` })),
      makePage({ url: 'https://example.com/one-off-fail', status: 'failed', error_reason: 'network', http_status: null }),
    ]
    const evidence = makeEvidence({ pages })
    expect(analyzeSiteWideConsistency(evidence)).toEqual([])
  })

  it('produces no findings for a fully healthy site (false-positive boundary)', () => {
    const pages = Array.from({ length: 10 }, (_, i) => makePage({ url: `https://example.com/p${i}` }))
    const evidence = makeEvidence({ pages })
    expect(analyzeSiteWideConsistency(evidence)).toEqual([])
  })
})
