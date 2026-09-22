import { describe, expect, it } from 'vitest'
import { analyzeIndexability } from '@/lib/technical-seo/checks/indexability'
import { buildPageIndex, buildInboundLinkCounts, completedPages } from '@/lib/technical-seo/evidence'
import type { AnalyzerContext } from '@/lib/technical-seo/context'
import { makeEvidence, makePage, makeLink } from './helpers/technical-seo-fixtures'
import type { CrawlEvidence } from '@/lib/technical-seo/evidence'

function contextFor(evidence: CrawlEvidence): AnalyzerContext {
  return { pageIndex: buildPageIndex(evidence), inboundLinkCounts: buildInboundLinkCounts(evidence), totalAnalyzedPages: completedPages(evidence).length }
}

describe('analyzeIndexability', () => {
  it('flags an explicit noindex page (high confidence, per Checkpoint 5)', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/private', noindex: true })] })
    const findings = analyzeIndexability(evidence, contextFor(evidence))
    const finding = findings.find((f) => f.checkKey === 'noindex_page')
    expect(finding?.confidence).toBe('high')
  })

  it('flags a page with no noindex signal that robots.txt nonetheless blocks', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/blocked', noindex: false, robots_allowed: false })] })
    const findings = analyzeIndexability(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'indexable_page_blocked_by_robots')).toBeDefined()
  })

  it('flags conflicting signals distinctly when both noindex and robots-blocked are true', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/both', noindex: true, robots_allowed: false })] })
    const findings = analyzeIndexability(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'conflicting_indexability_signals')).toBeDefined()
    // Not also double-counted as the "no noindex signal" robots-block check.
    expect(findings.find((f) => f.checkKey === 'indexable_page_blocked_by_robots')).toBeUndefined()
  })

  it('flags an important (heavily-linked) non-indexable page with only medium confidence', () => {
    const homepage = makePage({ url: 'https://example.com/', depth: 0 })
    const importantPage = makePage({ url: 'https://example.com/popular', noindex: true, depth: 2 })
    const links = Array.from({ length: 5 }, (_, i) => makeLink({ source_page_id: `source-${i}`, target_url: 'https://example.com/popular' }))
    const evidence = makeEvidence({ pages: [homepage, importantPage], links })

    const findings = analyzeIndexability(evidence, contextFor(evidence))
    const finding = findings.find((f) => f.checkKey === 'important_page_non_indexable')
    expect(finding).toBeDefined()
    expect(finding?.confidence).toBe('medium') // never shown as a certainty
  })

  it('does not flag an ordinary non-indexable page as "important" without enough inbound links', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/obscure', noindex: true, depth: 3 })] })
    const findings = analyzeIndexability(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'important_page_non_indexable')).toBeUndefined()
  })

  it('the homepage is always treated as important regardless of inbound link count', () => {
    const homepage = makePage({ url: 'https://example.com/', depth: 0, noindex: true })
    const evidence = makeEvidence({ pages: [homepage] })
    const findings = analyzeIndexability(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'important_page_non_indexable')).toBeDefined()
  })

  it('produces no findings for a normally indexable page (false-positive boundary)', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/', noindex: false, robots_allowed: true })] })
    expect(analyzeIndexability(evidence, contextFor(evidence))).toEqual([])
  })

  /**
   * REGRESSION (evidence-aware health scoring, 2026-09-22) — a real
   * customer's crawl had its homepage blocked (HTTP 403, almost certainly a
   * firewall/WAF challenge page), and that BLOCK PAGE's own noindex tag was
   * reported as "your important homepage is not indexable." `status ===
   * 'completed'` never implies a 2xx response — these prove the fix: a
   * non-2xx "completed" page's noindex/robots signals can no longer produce
   * ANY indexability finding, confirmed vs. depth===0 real homepage
   * BLOCK-PAGE NOINDEX MUST NOT BECOME CONFIRMED HOMEPAGE NOINDEX).
   */
  it('BLOCK-PAGE NOINDEX MUST NOT BECOME CONFIRMED HOMEPAGE NOINDEX: a 403 homepage response carrying noindex produces NO indexability finding at all', () => {
    const blockedHomepage = makePage({ url: 'https://example.com/', depth: 0, http_status: 403, noindex: true })
    const evidence = makeEvidence({ pages: [blockedHomepage] })
    const findings = analyzeIndexability(evidence, contextFor(evidence))
    expect(findings).toEqual([])
  })

  it('a blocked (5xx) page with noindex+robots-blocked produces no conflicting-signals finding either', () => {
    const blocked = makePage({ url: 'https://example.com/', depth: 0, http_status: 503, noindex: true, robots_allowed: false })
    const evidence = makeEvidence({ pages: [blocked] })
    expect(analyzeIndexability(evidence, contextFor(evidence))).toEqual([])
  })

  it('a blocked page with no noindex signal still does not produce indexable_page_blocked_by_robots — it was never successfully fetched as real content', () => {
    const blocked = makePage({ url: 'https://example.com/blocked', http_status: 429, noindex: false, robots_allowed: false })
    const evidence = makeEvidence({ pages: [blocked] })
    expect(analyzeIndexability(evidence, contextFor(evidence))).toEqual([])
  })

  it('a genuinely successful (2xx) noindex homepage IS still flagged — the fix narrows evidence, it does not silence real findings', () => {
    const homepage = makePage({ url: 'https://example.com/', depth: 0, http_status: 200, noindex: true })
    const evidence = makeEvidence({ pages: [homepage] })
    expect(analyzeIndexability(evidence, contextFor(evidence)).find((f) => f.checkKey === 'important_page_non_indexable')).toBeDefined()
  })
})
