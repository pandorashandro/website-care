import { describe, expect, it } from 'vitest'
import { analyzeUnderlinkedPages, UNDERLINKED_MAX_INBOUND } from '@/lib/architecture/checks/underlinked'
import { buildPageGraph } from '@/lib/architecture/graph'
import type { AnalyzerContext } from '@/lib/architecture/context'
import { makeEvidence, makePage, linkFrom } from './helpers/architecture-fixtures'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

function contextFor(evidence: CrawlEvidence, isPartialCrawl = false): AnalyzerContext {
  return { graph: buildPageGraph(evidence), totalAnalyzedPages: evidence.pages.filter((p) => p.status === 'completed').length, isPartialCrawl }
}

describe('analyzeUnderlinkedPages', () => {
  it('flags a page with exactly one inbound internal link', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const target = makePage({ url: 'https://example.com/lonely' })
    const evidence = makeEvidence({ pages: [home, target], links: [linkFrom(home, 'https://example.com/lonely')] })

    const findings = analyzeUnderlinkedPages(evidence, contextFor(evidence))
    const finding = findings.find((f) => f.checkKey === 'underlinked_page')
    expect(finding).toBeDefined()
    expect(finding?.affectedPages[0].detail).toEqual({ incomingLinkCount: 1, uniqueSourceCount: 1 })
  })

  it('does not flag a page with zero inbound links (that is the orphan check\'s job, not this one)', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const orphan = makePage({ url: 'https://example.com/orphan', discovered_via: 'sitemap' })
    const evidence = makeEvidence({ pages: [home, orphan] })

    expect(analyzeUnderlinkedPages(evidence, contextFor(evidence))).toEqual([])
  })

  it('does not flag a page with healthy inbound link support', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const target = makePage({ url: 'https://example.com/popular' })
    const sources = Array.from({ length: 5 }, (_, i) => makePage({ url: `https://example.com/s${i}` }))
    const evidence = makeEvidence({
      pages: [home, target, ...sources],
      links: sources.map((s) => linkFrom(s, 'https://example.com/popular')),
    })

    expect(analyzeUnderlinkedPages(evidence, contextFor(evidence))).toEqual([])
  })

  it('never asserts business importance as a known fact — phrasing is observational, not a false authority claim', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const target = makePage({ url: 'https://example.com/lonely' })
    const evidence = makeEvidence({ pages: [home, target], links: [linkFrom(home, 'https://example.com/lonely')] })

    const findings = analyzeUnderlinkedPages(evidence, contextFor(evidence))
    // The forbidden pattern per this phase's own instructions is claiming
    // authority/importance AS FACT (e.g. "this important page does not
    // receive enough authority") — never asserted here. It is fine to
    // mention that importance is unknown, as long as it is phrased as a
    // caveat webioom cannot resolve, which is exactly what is asserted.
    expect(findings[0].whyItMatters).not.toContain('does not receive enough authority')
    expect(findings[0].whyItMatters).toContain('very few internal links')
    expect(findings[0].whyItMatters).toContain('cannot determine')
  })

  it('SUPPRESSES underlinked findings entirely on a partial crawl', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const target = makePage({ url: 'https://example.com/lonely' })
    const evidence = makeEvidence({ crawlRun: { status: 'partial' }, pages: [home, target], links: [linkFrom(home, 'https://example.com/lonely')] })

    expect(analyzeUnderlinkedPages(evidence, contextFor(evidence, true))).toEqual([])
  })

  it(`does not flag a page right at the boundary above UNDERLINKED_MAX_INBOUND (${UNDERLINKED_MAX_INBOUND})`, () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const target = makePage({ url: 'https://example.com/target' })
    const sources = Array.from({ length: UNDERLINKED_MAX_INBOUND + 1 }, (_, i) => makePage({ url: `https://example.com/s${i}` }))
    const evidence = makeEvidence({ pages: [home, target, ...sources], links: sources.map((s) => linkFrom(s, 'https://example.com/target')) })

    expect(analyzeUnderlinkedPages(evidence, contextFor(evidence))).toEqual([])
  })
})
