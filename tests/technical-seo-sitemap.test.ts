import { describe, expect, it } from 'vitest'
import { analyzeSitemap } from '@/lib/technical-seo/checks/sitemap'
import { buildPageIndex, buildInboundLinkCounts, completedPages } from '@/lib/technical-seo/evidence'
import type { AnalyzerContext } from '@/lib/technical-seo/context'
import { makeEvidence, makePage } from './helpers/technical-seo-fixtures'
import type { CrawlEvidence } from '@/lib/technical-seo/evidence'

function contextFor(evidence: CrawlEvidence): AnalyzerContext {
  return { pageIndex: buildPageIndex(evidence), inboundLinkCounts: buildInboundLinkCounts(evidence), totalAnalyzedPages: completedPages(evidence).length }
}

describe('analyzeSitemap', () => {
  it('flags an unreachable sitemap and stops (nothing further to evaluate)', () => {
    const evidence = makeEvidence({ crawlRun: { sitemap_status: 'unreachable' }, pages: [makePage({ url: 'https://example.com/' })] })
    const findings = analyzeSitemap(evidence, contextFor(evidence))
    expect(findings).toHaveLength(1)
    expect(findings[0].checkKey).toBe('sitemap_unavailable')
  })

  it('flags a sitemap that was reachable but had no usable URLs', () => {
    const evidence = makeEvidence({ crawlRun: { sitemap_status: 'empty' }, pages: [makePage({ url: 'https://example.com/' })] })
    const findings = analyzeSitemap(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'sitemap_empty')).toBeDefined()
  })

  it('flags a sitemap URL that returns an error', () => {
    const evidence = makeEvidence({
      crawlRun: { sitemap_status: 'ok' },
      pages: [makePage({ url: 'https://example.com/broken', discovered_via: 'sitemap', http_status: 404 })],
    })
    const findings = analyzeSitemap(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'sitemap_contains_error_url')).toBeDefined()
  })

  it('flags a sitemap URL marked noindex', () => {
    const evidence = makeEvidence({
      crawlRun: { sitemap_status: 'ok' },
      pages: [makePage({ url: 'https://example.com/a', discovered_via: 'sitemap', noindex: true })],
    })
    const findings = analyzeSitemap(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'sitemap_contains_noindex_url')).toBeDefined()
  })

  it('flags a sitemap URL blocked by robots.txt', () => {
    const evidence = makeEvidence({
      crawlRun: { sitemap_status: 'ok' },
      pages: [makePage({ url: 'https://example.com/a', discovered_via: 'sitemap', robots_allowed: false })],
    })
    const findings = analyzeSitemap(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'sitemap_contains_blocked_url')).toBeDefined()
  })

  it('flags an important page discovered by links but missing from the sitemap, with only low/medium severity', () => {
    const homepage = makePage({ url: 'https://example.com/', depth: 0, discovered_via: 'seed' })
    const evidence = makeEvidence({ crawlRun: { sitemap_status: 'ok' }, pages: [homepage] })
    const findings = analyzeSitemap(evidence, contextFor(evidence))
    const finding = findings.find((f) => f.checkKey === 'important_page_missing_from_sitemap')
    expect(finding).toBeDefined()
    expect(finding?.baseSeverity).toBe('low')
  })

  it('does not evaluate sitemap-membership checks when the crawl_run predates this column (status null)', () => {
    const evidence = makeEvidence({ crawlRun: { sitemap_status: null }, pages: [makePage({ url: 'https://example.com/', depth: 0 })] })
    expect(analyzeSitemap(evidence, contextFor(evidence))).toEqual([])
  })

  it('produces no findings for a healthy sitemap covering the important page (false-positive boundary)', () => {
    const homepage = makePage({ url: 'https://example.com/', depth: 0, discovered_via: 'sitemap' })
    const evidence = makeEvidence({ crawlRun: { sitemap_status: 'ok' }, pages: [homepage] })
    expect(analyzeSitemap(evidence, contextFor(evidence))).toEqual([])
  })
})
