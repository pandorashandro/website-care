import { describe, expect, it } from 'vitest'
import { isArchitectureEligiblePage } from '@/lib/architecture/eligibility'
import { eligibilityFailureReason } from '@/lib/category-engine/eligibility'
import { analyzeOrphanPages } from '@/lib/architecture/checks/orphan'
import { analyzeDeadEnds } from '@/lib/architecture/checks/dead-ends'
import { analyzeDeepPages } from '@/lib/architecture/checks/deep-pages'
import { analyzeUnderlinkedPages } from '@/lib/architecture/checks/underlinked'
import { analyzeSiteWideConsistency } from '@/lib/architecture/checks/site-wide'
import { buildPageGraph } from '@/lib/architecture/graph'
import type { AnalyzerContext } from '@/lib/architecture/context'
import { makeEvidence, makePage, linkFrom } from './helpers/architecture-fixtures'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

/**
 * Real-world evidence-quality pass (Bespoke 94/100 review) — Parts D-H.
 * Verifies the general, evidence-based `isArchitectureEligiblePage`
 * predicate (lib/architecture/eligibility.ts) both in isolation and wired
 * into every page-level check it now gates. Deliberately never asserts
 * against a specific URL PATTERN (no "wpr_mega_menu" string anywhere in
 * this file) — every fixture is distinguished only by evidence fields
 * (noindex/canonical_url/http_status/content_type/status), proving the
 * rule is general rather than a disguised CMS-specific hack.
 */
function contextFor(evidence: CrawlEvidence, isPartialCrawl = false): AnalyzerContext {
  return { graph: buildPageGraph(evidence), totalAnalyzedPages: evidence.pages.filter((p) => p.status === 'completed').length, isPartialCrawl }
}

describe('isArchitectureEligiblePage', () => {
  it('a normal, successfully-fetched, indexable, self-canonical HTML page is eligible', () => {
    expect(isArchitectureEligiblePage(makePage({ url: 'https://example.com/solutions' }))).toBe(true)
  })

  it('a page marked noindex is not eligible', () => {
    expect(isArchitectureEligiblePage(makePage({ url: 'https://example.com/utility', noindex: true }))).toBe(false)
  })

  it('a page whose canonical tag points at a DIFFERENT URL is not eligible (self-declared duplicate/variant)', () => {
    const page = makePage({ url: 'https://example.com/utility?x=1', canonical_url: 'https://example.com/real-page' })
    expect(isArchitectureEligiblePage(page)).toBe(false)
  })

  it('a page whose canonical tag points at its OWN URL remains eligible', () => {
    const page = makePage({ url: 'https://example.com/solutions', canonical_url: 'https://example.com/solutions' })
    expect(isArchitectureEligiblePage(page)).toBe(true)
  })

  it('a page with no canonical tag at all remains eligible (absence is not a disqualifier)', () => {
    const page = makePage({ url: 'https://example.com/solutions', canonical_url: null })
    expect(isArchitectureEligiblePage(page)).toBe(true)
  })

  it('a page that failed to fetch is not eligible', () => {
    const page = makePage({ url: 'https://example.com/gone', status: 'failed', http_status: null })
    expect(isArchitectureEligiblePage(page)).toBe(false)
  })

  it('a page that returned a non-2xx status is not eligible (its own defect is the subject of broken/redirect-edge checks, not these)', () => {
    const page = makePage({ url: 'https://example.com/broken', http_status: 404 })
    expect(isArchitectureEligiblePage(page)).toBe(false)
  })

  it('a non-HTML resource is not eligible', () => {
    const page = makePage({ url: 'https://example.com/file.pdf', content_type: 'application/pdf' })
    expect(isArchitectureEligiblePage(page)).toBe(false)
  })

  it('a legitimate query-string page with no noindex and no cross-canonical remains eligible — query strings alone never disqualify', () => {
    const page = makePage({ url: 'https://example.com/products?category=shoes' })
    expect(isArchitectureEligiblePage(page)).toBe(true)
  })

  it('unparseable (non-http/https) canonical evidence is treated conservatively (kept, not excluded)', () => {
    const page = makePage({ url: 'https://example.com/solutions', canonical_url: 'javascript:void(0)' })
    expect(isArchitectureEligiblePage(page)).toBe(true)
  })
})

/**
 * Founder-reported bug (2026-09-22) — On-Page SEO's report page needs to
 * explain WHY a page was excluded, not just that it was. eligibilityFailureReason
 * shares isEligibleContentPage's own checks in the same order, so every case
 * here doubles as a guarantee that the reason returned can never disagree
 * with isEligibleContentPage's/isArchitectureEligiblePage's/isOnPageEligiblePage's
 * own true/false verdict above.
 */
describe('eligibilityFailureReason', () => {
  it('returns null for an eligible page', () => {
    expect(eligibilityFailureReason(makePage({ url: 'https://example.com/solutions' }))).toBeNull()
  })

  it("returns 'not_fetched' for a page whose fetch never completed", () => {
    const page = makePage({ url: 'https://example.com/gone', status: 'failed', http_status: null })
    expect(eligibilityFailureReason(page)).toBe('not_fetched')
  })

  it("returns 'blocked_or_error_status' for a non-2xx response, even one that also carries noindex (the REPORTED BUG's exact shape) — status is checked before noindex", () => {
    const page = makePage({ url: 'https://example.com/', http_status: 403, noindex: true })
    expect(eligibilityFailureReason(page)).toBe('blocked_or_error_status')
  })

  it("returns 'non_html' for a non-HTML content type", () => {
    const page = makePage({ url: 'https://example.com/file.pdf', content_type: 'application/pdf' })
    expect(eligibilityFailureReason(page)).toBe('non_html')
  })

  it("returns 'noindex' for an otherwise-successful page marked noindex", () => {
    const page = makePage({ url: 'https://example.com/utility', noindex: true })
    expect(eligibilityFailureReason(page)).toBe('noindex')
  })

  it("returns 'cross_canonical' for a page whose canonical names a different URL", () => {
    const page = makePage({ url: 'https://example.com/dup?x=1', canonical_url: 'https://example.com/real' })
    expect(eligibilityFailureReason(page)).toBe('cross_canonical')
  })

  it('a self-referential canonical is NOT reported as cross_canonical (must agree with isArchitectureEligiblePage treating it as eligible)', () => {
    const page = makePage({ url: 'https://example.com/solutions', canonical_url: 'https://example.com/solutions' })
    expect(eligibilityFailureReason(page)).toBeNull()
    expect(isArchitectureEligiblePage(page)).toBe(true)
  })
})

describe('eligibility wired into page-level checks (Part H #7-#10)', () => {
  it('excludes a utility page from orphan_page even with zero inbound links', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const utility = makePage({ url: 'https://example.com/widget?x=1', discovered_via: 'sitemap', noindex: true })
    const evidence = makeEvidence({ pages: [home, utility] })

    expect(analyzeOrphanPages(evidence, contextFor(evidence))).toEqual([])
  })

  it('excludes a utility page from dead_end_page even with zero outgoing links', () => {
    const utility = makePage({ url: 'https://example.com/widget?x=1', noindex: true })
    const evidence = makeEvidence({ pages: [utility] })

    expect(analyzeDeadEnds(evidence, contextFor(evidence))).toEqual([])
  })

  it('still detects a genuine, eligible dead-end page (query-string or not) — eligibility is not a blanket exclusion', () => {
    const eligibleDeadEnd = makePage({ url: 'https://example.com/thank-you?ref=email' })
    const evidence = makeEvidence({ pages: [eligibleDeadEnd] })

    const findings = analyzeDeadEnds(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'dead_end_page')).toBeDefined()
  })

  it('excludes a utility page from deep_page even at depth >= threshold', () => {
    const utility = makePage({ url: 'https://example.com/deep-widget?x=1', depth: 5, noindex: true })
    const evidence = makeEvidence({ pages: [utility] })

    expect(analyzeDeepPages(evidence)).toEqual([])
  })

  it('still detects a genuine, eligible deep page', () => {
    const deep = makePage({ url: 'https://example.com/deep-real', depth: 5 })
    const evidence = makeEvidence({ pages: [deep] })

    expect(analyzeDeepPages(evidence).find((f) => f.checkKey === 'deep_page')).toBeDefined()
  })

  it('excludes a utility page from underlinked_page even with only 1 inbound link', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const utility = makePage({ url: 'https://example.com/widget?x=1', noindex: true })
    const evidence = makeEvidence({ pages: [home, utility], links: [linkFrom(home, 'https://example.com/widget?x=1')] })

    expect(analyzeUnderlinkedPages(evidence, contextFor(evidence))).toEqual([])
  })

  it('a mixed eligible/ineligible page graph only reports the eligible dead end, not the utility pages', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const realDeadEnd = makePage({ url: 'https://example.com/thank-you' })
    const utilityA = makePage({ url: 'https://example.com/menu?a=1', noindex: true })
    const utilityB = makePage({ url: 'https://example.com/menu?b=1', canonical_url: 'https://example.com/' })
    const evidence = makeEvidence({
      pages: [home, realDeadEnd, utilityA, utilityB],
      links: [linkFrom(home, 'https://example.com/thank-you'), linkFrom(home, 'https://example.com/menu?a=1'), linkFrom(home, 'https://example.com/menu?b=1')],
    })

    const findings = analyzeDeadEnds(evidence, contextFor(evidence))
    const finding = findings.find((f) => f.checkKey === 'dead_end_page')
    expect(finding?.affectedPages.map((p) => p.url)).toEqual(['https://example.com/thank-you'])
  })

  it('widespread_isolated_pages measures its ratio over eligible pages only, so utility pages cannot manufacture a false pattern', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const wellLinked = Array.from({ length: 4 }, (_, i) => makePage({ url: `https://example.com/p${i}` }))
    // 6 ineligible utility pages, all isolated -- must not count toward the
    // eligible population OR the isolated numerator.
    const utilityPages = Array.from({ length: 6 }, (_, i) => makePage({ url: `https://example.com/widget?u=${i}`, noindex: true }))
    const evidence = makeEvidence({
      pages: [home, ...wellLinked, ...utilityPages],
      links: wellLinked.map((p) => linkFrom(home, p.url)),
    })

    expect(analyzeSiteWideConsistency(evidence, contextFor(evidence))).toEqual([])
  })

  it('normal content pages used in the real-world review remain eligible and unaffected', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const hub = makePage({ url: 'https://example.com/services', depth: 1 })
    const onboarding = makePage({ url: 'https://example.com/services/digital-marketing/digital-marketing-onboarding', depth: 3 })
    const solutions = makePage({ url: 'https://example.com/solutions', depth: 1 })
    // A small mesh (every page links to every other) so each of the two
    // pages under test gets 3 distinct inbound sources, clearing the
    // SEPARATE underlinked-page threshold (1-2 inbound) -- this test
    // isolates the eligibility question, not link distribution.
    const allPages = [home, hub, onboarding, solutions]
    const links = allPages.flatMap((source) => allPages.filter((target) => target.url !== source.url).map((target) => linkFrom(source, target.url)))
    const evidence = makeEvidence({ pages: allPages, links })

    expect(analyzeOrphanPages(evidence, contextFor(evidence))).toEqual([])
    expect(analyzeUnderlinkedPages(evidence, contextFor(evidence))).toEqual([])
  })
})
