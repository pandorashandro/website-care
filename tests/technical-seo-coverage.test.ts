import { describe, expect, it } from 'vitest'
import { computeTechnicalSeoCoverage } from '@/lib/technical-seo/coverage'
import { makePage } from './helpers/technical-seo-fixtures'

/**
 * Evidence-aware health scoring (2026-09-22, follow-up correction).
 * Technical SEO's coverage model tracks TWO populations (see
 * lib/technical-seo/coverage.ts's own doc comment): `completedPageCount`
 * (any response at all) and `eligiblePageCount` (2xx HTML only) — but
 * `level` now ALSO consults `computeSiteAccessState()`: a crawl the whole
 * site blocked (or that failed to fetch anything at all) resolves to
 * 'none', never 'low', because none of its crawlability/robots/sitemap
 * findings can be trusted as confirmed website defects — they are symptoms
 * of the SAME single access-denial event, not independent evidence.
 */
describe('computeTechnicalSeoCoverage', () => {
  it("REGRESSION (follow-up) — the exact reported bug's shape (a single 403 page, whole crawl blocked) is 'none', not 'low' — robots_unreachable/sitemap_unavailable/internal_page_4xx cannot be trusted as confirmed defects here", () => {
    const blocked = makePage({ url: 'https://example.com/', http_status: 403, noindex: true })
    const coverage = computeTechnicalSeoCoverage([blocked], { robots_status: 'unreachable', sitemap_status: 'unreachable' })
    expect(coverage.level).toBe('none')
    expect(coverage.siteAccessState).toBe('blocked')
    expect(coverage.eligiblePageCount).toBe(0)
    expect(coverage.completedPageCount).toBe(1)
  })

  it("a genuine 2xx, noindexed page is 'adequate' for Technical SEO's OWN eligibility (isSuccessfulHtmlFetch only requires 2xx HTML, not 'not noindex') even though computeSiteAccessState's STRICTER population calls this 'insufficient_content' — indexability specifically needs to see this exact page as its subject, so it cannot be excluded from Technical SEO's own coverage", () => {
    const noindexed = makePage({ url: 'https://example.com/', http_status: 200, noindex: true })
    const coverage = computeTechnicalSeoCoverage([noindexed], { robots_status: 'ok', sitemap_status: 'ok' })
    expect(coverage.level).toBe('adequate')
    expect(coverage.eligiblePageCount).toBe(1)
    expect(coverage.siteAccessState).toBe('insufficient_content')
  })

  it("a genuinely non-HTML-only site (2xx but not HTML, NOT blocked) gets 'low' — access was fine, but Technical SEO's own content-dependent checks have no real 2xx-HTML subject", () => {
    const nonHtml = makePage({ url: 'https://example.com/file.pdf', http_status: 200, content_type: 'application/pdf' })
    const coverage = computeTechnicalSeoCoverage([nonHtml], { robots_status: 'ok', sitemap_status: 'ok' })
    expect(coverage.level).toBe('low')
    expect(coverage.eligiblePageCount).toBe(0)
  })

  it("'none' only when the crawl reached literally zero pages", () => {
    const coverage = computeTechnicalSeoCoverage([], { robots_status: null, sitemap_status: null })
    expect(coverage.level).toBe('none')
    expect(coverage.siteAccessState).toBe('fetch_failed')
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
