import { describe, expect, it } from 'vitest'
import { analyzeCrawlability } from '@/lib/technical-seo/checks/crawlability'
import { makeEvidence, makePage } from './helpers/technical-seo-fixtures'

describe('analyzeCrawlability', () => {
  it('flags a page that could not be fetched at all', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/broken', status: 'failed', error_reason: 'network', http_status: null })] })
    const findings = analyzeCrawlability(evidence)
    const finding = findings.find((f) => f.checkKey === 'fetch_failed')
    expect(finding).toBeDefined()
    expect(finding?.affectedPages).toEqual([{ url: 'https://example.com/broken', detail: { errorReason: 'network' } }])
  })

  it('gives a redirect loop its own distinct finding, not the generic fetch_failed one', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/loop', status: 'failed', error_reason: 'redirect_loop', http_status: null })] })
    const findings = analyzeCrawlability(evidence)
    expect(findings.find((f) => f.checkKey === 'redirect_loop_page')).toBeDefined()
    expect(findings.find((f) => f.checkKey === 'fetch_failed')).toBeUndefined()
  })

  it('flags a completed page with a long redirect chain', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/many-hops', redirect_count: 4 })] })
    const findings = analyzeCrawlability(evidence)
    const finding = findings.find((f) => f.checkKey === 'excessive_redirect_chain')
    expect(finding).toBeDefined()
    expect(finding?.affectedPages[0].detail).toEqual({ redirectCount: 4 })
  })

  it('treats a failure due to too_many_redirects as the same excessive_redirect_chain check, not fetch_failed', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/x', status: 'failed', error_reason: 'too_many_redirects', http_status: null })] })
    const findings = analyzeCrawlability(evidence)
    expect(findings.find((f) => f.checkKey === 'excessive_redirect_chain')).toBeDefined()
    expect(findings.find((f) => f.checkKey === 'fetch_failed')).toBeUndefined()
  })

  it('flags a 404 page distinctly from other 4xx codes', () => {
    const evidence = makeEvidence({
      pages: [makePage({ url: 'https://example.com/missing', http_status: 404 }), makePage({ url: 'https://example.com/forbidden', http_status: 403 })],
    })
    const findings = analyzeCrawlability(evidence)
    const fourOhFours = findings.filter((f) => f.checkKey === 'internal_page_4xx')
    expect(fourOhFours).toHaveLength(2) // one for 404s, one for other 4xx — aggregate.ts merges these later
    expect(fourOhFours.some((f) => f.baseSeverity === 'high')).toBe(true) // the 404 instance
  })

  it('flags a 5xx server error as critical', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/oops', http_status: 500 })] })
    const findings = analyzeCrawlability(evidence)
    const finding = findings.find((f) => f.checkKey === 'internal_page_5xx')
    expect(finding?.baseSeverity).toBe('critical')
  })

  it('produces no findings for a fully healthy page (false-positive boundary)', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/', http_status: 200, redirect_count: 0 })] })
    expect(analyzeCrawlability(evidence)).toEqual([])
  })

  it('never flags a queued or skipped-by-budget page as a crawlability failure', () => {
    const evidence = makeEvidence({
      pages: [makePage({ url: 'https://example.com/never-reached', status: 'skipped', error_reason: 'crawl_page_budget_reached', http_status: null })],
    })
    expect(analyzeCrawlability(evidence)).toEqual([])
  })
})
