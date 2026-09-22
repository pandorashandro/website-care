import { describe, expect, it } from 'vitest'
import { computeTechnicalSeoCoverage } from '@/lib/technical-seo/coverage'
import { makePage } from './helpers/technical-seo-fixtures'

/**
 * Evidence-aware health scoring (2026-09-22). Technical SEO's coverage
 * model tracks TWO populations (see lib/technical-seo/coverage.ts's own doc
 * comment): `completedPageCount` (any response at all) and
 * `eligiblePageCount` (2xx HTML only). 'none' requires the crawl to have
 * reached literally nothing; 'low' means some response(s) came back but
 * none were usable real content (the reported bug's exact shape — a single
 * 403 page).
 */
describe('computeTechnicalSeoCoverage', () => {
  it("REGRESSION — the exact reported bug's shape (a single 403 page) is 'low', not 'none' — crawlability findings remain valid evidence", () => {
    const blocked = makePage({ url: 'https://example.com/', http_status: 403, noindex: true })
    const coverage = computeTechnicalSeoCoverage([blocked], { robots_status: 'ok', sitemap_status: 'ok' })
    expect(coverage.level).toBe('low')
    expect(coverage.eligiblePageCount).toBe(0)
    expect(coverage.completedPageCount).toBe(1)
  })

  it("'none' only when the crawl reached literally zero pages", () => {
    const coverage = computeTechnicalSeoCoverage([], { robots_status: null, sitemap_status: null })
    expect(coverage.level).toBe('none')
  })

  it("a genuinely successful 2xx HTML page is 'adequate'", () => {
    const page = makePage({ url: 'https://example.com/', http_status: 200 })
    const coverage = computeTechnicalSeoCoverage([page], { robots_status: 'ok', sitemap_status: 'ok' })
    expect(coverage.level).toBe('adequate')
    expect(coverage.eligiblePageCount).toBe(1)
  })

  it('carries robots/sitemap status through verbatim for reference', () => {
    const page = makePage({ url: 'https://example.com/' })
    const coverage = computeTechnicalSeoCoverage([page], { robots_status: 'unreachable', sitemap_status: 'unreachable' })
    expect(coverage.robotsStatus).toBe('unreachable')
    expect(coverage.sitemapStatus).toBe('unreachable')
  })

  it('a mix of blocked and eligible pages is adequate — even one real page is enough', () => {
    const blocked = makePage({ url: 'https://example.com/a', http_status: 403 })
    const eligible = makePage({ url: 'https://example.com/b', http_status: 200 })
    const coverage = computeTechnicalSeoCoverage([blocked, eligible], { robots_status: 'ok', sitemap_status: 'ok' })
    expect(coverage.level).toBe('adequate')
    expect(coverage.eligiblePageCount).toBe(1)
    expect(coverage.completedPageCount).toBe(2)
  })
})
