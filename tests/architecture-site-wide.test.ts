import { describe, expect, it } from 'vitest'
import { analyzeSiteWideConsistency } from '@/lib/architecture/checks/site-wide'
import { buildPageGraph } from '@/lib/architecture/graph'
import type { AnalyzerContext } from '@/lib/architecture/context'
import { makeEvidence, makePage, linkFrom } from './helpers/architecture-fixtures'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

function contextFor(evidence: CrawlEvidence, isPartialCrawl = false): AnalyzerContext {
  return { graph: buildPageGraph(evidence), totalAnalyzedPages: evidence.pages.filter((p) => p.status === 'completed').length, isPartialCrawl }
}

describe('analyzeSiteWideConsistency', () => {
  it('flags widespread isolation when a large share of pages have zero inbound links', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const linked = makePage({ url: 'https://example.com/linked' })
    const isolated = Array.from({ length: 4 }, (_, i) => makePage({ url: `https://example.com/isolated-${i}`, discovered_via: 'sitemap' }))
    const evidence = makeEvidence({ pages: [home, linked, ...isolated], links: [linkFrom(home, 'https://example.com/linked')] })

    const findings = analyzeSiteWideConsistency(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'widespread_isolated_pages')).toBeDefined()
  })

  describe('severity scales with the isolation ratio (Phase 27 score-calibration audit correction)', () => {
    it('uses "high" severity for a moderate isolation ratio (20-49%)', () => {
      const home = makePage({ url: 'https://example.com/', depth: 0 })
      const linked = Array.from({ length: 7 }, (_, i) => makePage({ url: `https://example.com/linked-${i}` }))
      const isolated = Array.from({ length: 2 }, (_, i) => makePage({ url: `https://example.com/isolated-${i}`, discovered_via: 'sitemap' }))
      // 2 of 10 completed pages (1 home + 7 linked + 2 isolated) isolated =
      // 20% — right at the reporting threshold, comfortably under the 50%
      // "severe" threshold.
      const evidence = makeEvidence({ pages: [home, ...linked, ...isolated], links: linked.map((p) => linkFrom(home, p.url)) })

      const finding = analyzeSiteWideConsistency(evidence, contextFor(evidence)).find((f) => f.checkKey === 'widespread_isolated_pages')
      expect(finding?.baseSeverity).toBe('high')
    })

    it('escalates to "critical" severity when at least half the site is isolated — never scored the same as a moderate case', () => {
      const home = makePage({ url: 'https://example.com/', depth: 0 })
      const linked = makePage({ url: 'https://example.com/linked' })
      const isolated = Array.from({ length: 4 }, (_, i) => makePage({ url: `https://example.com/isolated-${i}`, discovered_via: 'sitemap' }))
      // 4 of 6 completed pages isolated = 66.7% — severely disconnected.
      const evidence = makeEvidence({ pages: [home, linked, ...isolated], links: [linkFrom(home, 'https://example.com/linked')] })

      const finding = analyzeSiteWideConsistency(evidence, contextFor(evidence)).find((f) => f.checkKey === 'widespread_isolated_pages')
      expect(finding?.baseSeverity).toBe('critical')
    })
  })

  it('does not flag widespread isolation from too small a sample', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const isolated = makePage({ url: 'https://example.com/isolated', discovered_via: 'sitemap' })
    const evidence = makeEvidence({ pages: [home, isolated] })

    expect(analyzeSiteWideConsistency(evidence, contextFor(evidence))).toEqual([])
  })

  it('does not flag a healthy, well-linked site', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const pages = Array.from({ length: 9 }, (_, i) => makePage({ url: `https://example.com/p${i}` }))
    const evidence = makeEvidence({ pages: [home, ...pages], links: pages.map((p) => linkFrom(home, p.url)) })

    expect(analyzeSiteWideConsistency(evidence, contextFor(evidence))).toEqual([])
  })

  it('is SUPPRESSED entirely on a partial crawl', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const isolated = Array.from({ length: 5 }, (_, i) => makePage({ url: `https://example.com/isolated-${i}`, discovered_via: 'sitemap' }))
    const evidence = makeEvidence({ crawlRun: { status: 'partial' }, pages: [home, ...isolated] })

    expect(analyzeSiteWideConsistency(evidence, contextFor(evidence, true))).toEqual([])
  })
})
