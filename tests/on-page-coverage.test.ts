import { describe, expect, it } from 'vitest'
import { computeOnPageCoverage, describeMostCommonIneligibilityReason } from '@/lib/on-page/coverage'
import { makePage } from './helpers/architecture-fixtures'

/**
 * Founder-reported bug (2026-09-22): a real customer's On-Page SEO report
 * showed "Health: 100 / Pages analyzed: 1 / No on-page problems found" for
 * a crawl whose one and only fetched page came back HTTP 403 and noindex —
 * i.e. was NOT actually eligible for analysis at all. The real eligible
 * page count was ZERO, and every check trivially "passed" over an empty
 * set. These tests lock in the fix: computeOnPageCoverage must report
 * 'none' for that exact scenario, and describeMostCommonIneligibilityReason
 * must explain why using only the page's own persisted evidence.
 */
describe('computeOnPageCoverage', () => {
  it("REGRESSION — the exact reported bug: 0 eligible pages is 'none', never silently treated as a valid analysis", () => {
    const coverage = computeOnPageCoverage(0, 1)
    expect(coverage.level).toBe('none')
    expect(coverage.eligiblePageCount).toBe(0)
    expect(coverage.comparisonChecksAssessed).toBe(false)
  })

  it("exactly 1 eligible page is 'low' — per-page checks are meaningful, comparison checks are not", () => {
    const coverage = computeOnPageCoverage(1, 1)
    expect(coverage.level).toBe('low')
    expect(coverage.comparisonChecksAssessed).toBe(false)
  })

  it("2 or more eligible pages is 'adequate' and clears the comparison-check bar", () => {
    expect(computeOnPageCoverage(2, 2).level).toBe('adequate')
    expect(computeOnPageCoverage(2, 2).comparisonChecksAssessed).toBe(true)
    expect(computeOnPageCoverage(50, 50).level).toBe('adequate')
  })

  it('totalAnalyzedPages is carried through verbatim for reference, never used to decide the level', () => {
    // A crawl can fetch many pages (totalAnalyzedPages) while almost none of
    // them are actually eligible (e.g. mostly blocked/noindexed) — the
    // level must track eligiblePageCount, not the larger fetched count.
    const coverage = computeOnPageCoverage(0, 50)
    expect(coverage.level).toBe('none')
    expect(coverage.totalAnalyzedPages).toBe(50)
  })
})

describe('describeMostCommonIneligibilityReason', () => {
  it('REGRESSION — a single 403+noindex page (the exact reported bug) is described as a blocked/error response, not noindex', () => {
    // isEligibleContentPage checks status/http_status BEFORE noindex, so a
    // page that is both non-2xx AND noindex is attributed to the more
    // fundamental reason (blocked_or_error_status) — matching
    // eligibilityFailureReason's own check order exactly.
    const page = makePage({ url: 'https://example.com/', http_status: 403, noindex: true })
    expect(describeMostCommonIneligibilityReason([page])).toContain('firewall or bot-protection block')
  })

  it('returns null when every page is actually eligible (nothing to explain)', () => {
    const page = makePage({ url: 'https://example.com/' })
    expect(describeMostCommonIneligibilityReason([page])).toBeNull()
  })

  it('describes a noindexed page distinctly from a blocked one', () => {
    const page = makePage({ url: 'https://example.com/utility', noindex: true })
    expect(describeMostCommonIneligibilityReason([page])).toContain('noindex')
  })

  it('describes a cross-canonical page distinctly', () => {
    const page = makePage({ url: 'https://example.com/dup', canonical_url: 'https://example.com/real' })
    expect(describeMostCommonIneligibilityReason([page])).toContain('different page as its canonical version')
  })

  it('describes a page that never finished fetching (status !== completed) as unreachable', () => {
    const page = makePage({ url: 'https://example.com/gone', status: 'failed', http_status: null })
    expect(describeMostCommonIneligibilityReason([page])).toContain('could not be reached')
  })

  it('reports the MOST COMMON reason across a mixed set of excluded pages, ignoring eligible ones entirely', () => {
    const pages = [
      makePage({ url: 'https://example.com/' }), // eligible — must not count toward any reason
      makePage({ url: 'https://example.com/a', http_status: 403 }),
      makePage({ url: 'https://example.com/b', http_status: 500 }),
      makePage({ url: 'https://example.com/c', noindex: true }),
    ]
    expect(describeMostCommonIneligibilityReason(pages)).toContain('firewall or bot-protection block')
  })
})
