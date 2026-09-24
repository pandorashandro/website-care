import { describe, expect, it } from 'vitest'
import { analyzeDeadEnds } from '@/lib/architecture/checks/dead-ends'
import { buildPageGraph } from '@/lib/architecture/graph'
import type { AnalyzerContext } from '@/lib/architecture/context'
import { makeEvidence, makePage, linkFrom } from './helpers/architecture-fixtures'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

function contextFor(evidence: CrawlEvidence, isPartialCrawl = false): AnalyzerContext {
  return { graph: buildPageGraph(evidence), totalAnalyzedPages: evidence.pages.filter((p) => p.status === 'completed').length, isPartialCrawl }
}

describe('analyzeDeadEnds', () => {
  it('flags an HTML page with no outgoing internal links, given a genuine multi-page graph to evaluate it against', () => {
    const home = makePage({ url: 'https://example.com/' })
    const thankYou = makePage({ url: 'https://example.com/thank-you' })
    const evidence = makeEvidence({ pages: [home, thankYou], links: [linkFrom(home, thankYou.url)] })

    const findings = analyzeDeadEnds(evidence, contextFor(evidence))
    const finding = findings.find((f) => f.checkKey === 'dead_end_page')
    expect(finding).toBeDefined()
    expect(finding?.confidence).toBe('low') // deliberately low — often intentional
    expect(finding?.affectedPages.map((p) => p.url)).toEqual([thankYou.url])
  })

  /**
   * Scoring Engine V1 calibration (2026-09-24): a single-page site's
   * homepage trivially has 0 outbound internal links (there is nothing
   * else on the site to link to yet) — that is an artifact of there being
   * no graph at all, not a real navigational defect. See this pillar's own
   * coverage.ts doc comment: a real link graph needs at least 2 eligible
   * pages before ANY graph-shaped check can say something meaningful.
   */
  it('does not flag a genuinely single-page site — there is no graph yet to evaluate, not a confirmed defect', () => {
    const page = makePage({ url: 'https://example.com/thank-you' })
    const evidence = makeEvidence({ pages: [page] })
    expect(analyzeDeadEnds(evidence, contextFor(evidence))).toEqual([])
  })

  it('does not flag a page that links to other pages', () => {
    const home = makePage({ url: 'https://example.com/' })
    const about = makePage({ url: 'https://example.com/about' })
    const evidence = makeEvidence({
      pages: [home, about],
      links: [linkFrom(home, 'https://example.com/about'), linkFrom(about, 'https://example.com/')],
    })

    expect(analyzeDeadEnds(evidence, contextFor(evidence))).toEqual([])
  })

  it('does not evaluate a non-HTML resource', () => {
    const pdf = makePage({ url: 'https://example.com/file.pdf', content_type: 'application/pdf' })
    const evidence = makeEvidence({ pages: [pdf] })
    expect(analyzeDeadEnds(evidence, contextFor(evidence))).toEqual([])
  })

  it('is NOT suppressed on a partial crawl — a page\'s own outbound links are fully known regardless of crawl completeness', () => {
    const home = makePage({ url: 'https://example.com/' })
    const thankYou = makePage({ url: 'https://example.com/thank-you' })
    const evidence = makeEvidence({ crawlRun: { status: 'partial' }, pages: [home, thankYou], links: [linkFrom(home, thankYou.url)] })

    const findings = analyzeDeadEnds(evidence, contextFor(evidence, true))
    expect(findings.find((f) => f.checkKey === 'dead_end_page')).toBeDefined()
  })

  it('does not evaluate a page that failed to crawl', () => {
    const page = makePage({ url: 'https://example.com/failed', status: 'failed', http_status: null })
    const evidence = makeEvidence({ pages: [page] })
    expect(analyzeDeadEnds(evidence, contextFor(evidence))).toEqual([])
  })
})
