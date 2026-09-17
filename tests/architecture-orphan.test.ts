import { describe, expect, it } from 'vitest'
import { analyzeOrphanPages } from '@/lib/architecture/checks/orphan'
import { buildPageGraph } from '@/lib/architecture/graph'
import type { AnalyzerContext } from '@/lib/architecture/context'
import { makeEvidence, makePage, linkFrom } from './helpers/architecture-fixtures'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

function contextFor(evidence: CrawlEvidence, isPartialCrawl = false): AnalyzerContext {
  return { graph: buildPageGraph(evidence), totalAnalyzedPages: evidence.pages.filter((p) => p.status === 'completed').length, isPartialCrawl }
}

describe('analyzeOrphanPages', () => {
  it('flags a sitemap-discovered page with zero inbound internal links', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const orphan = makePage({ url: 'https://example.com/forgotten', discovered_via: 'sitemap', depth: 1 })
    const evidence = makeEvidence({ pages: [home, orphan] })

    const findings = analyzeOrphanPages(evidence, contextFor(evidence))
    const finding = findings.find((f) => f.checkKey === 'orphan_page')
    expect(finding).toBeDefined()
    expect(finding?.affectedPages.map((p) => p.url)).toEqual(['https://example.com/forgotten'])
  })

  it('never labels the homepage an orphan, even with zero inbound links', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const evidence = makeEvidence({ pages: [home] })

    const findings = analyzeOrphanPages(evidence, contextFor(evidence))
    expect(findings).toEqual([])
  })

  it('does not flag a page discovered via a link, since discovery via a link implies at least one inbound edge', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const linked = makePage({ url: 'https://example.com/linked', discovered_via: 'link', depth: 1 })
    const evidence = makeEvidence({ pages: [home, linked], links: [linkFrom(home, 'https://example.com/linked')] })

    const findings = analyzeOrphanPages(evidence, contextFor(evidence))
    expect(findings).toEqual([])
  })

  it('SUPPRESSES orphan findings entirely on a partial crawl — never claims orphan when the boundary could explain missing inbound links', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const maybeOrphan = makePage({ url: 'https://example.com/maybe', discovered_via: 'sitemap', depth: 1 })
    const evidence = makeEvidence({ crawlRun: { status: 'partial' }, pages: [home, maybeOrphan] })

    const findings = analyzeOrphanPages(evidence, contextFor(evidence, true))
    expect(findings).toEqual([])
  })

  it('does not flag a page that failed to crawl (only completed pages are evaluated)', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const failed = makePage({ url: 'https://example.com/failed', status: 'failed', http_status: null, discovered_via: 'sitemap' })
    const evidence = makeEvidence({ pages: [home, failed] })

    const findings = analyzeOrphanPages(evidence, contextFor(evidence))
    expect(findings).toEqual([])
  })

  it('produces no findings for a well-linked site (false-positive boundary)', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const about = makePage({ url: 'https://example.com/about' })
    const evidence = makeEvidence({ pages: [home, about], links: [linkFrom(home, 'https://example.com/about')] })

    expect(analyzeOrphanPages(evidence, contextFor(evidence))).toEqual([])
  })
})
