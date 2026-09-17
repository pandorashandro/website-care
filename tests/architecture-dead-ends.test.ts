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
  it('flags an HTML page with no outgoing internal links', () => {
    const page = makePage({ url: 'https://example.com/thank-you' })
    const evidence = makeEvidence({ pages: [page] })

    const findings = analyzeDeadEnds(evidence, contextFor(evidence))
    const finding = findings.find((f) => f.checkKey === 'dead_end_page')
    expect(finding).toBeDefined()
    expect(finding?.confidence).toBe('low') // deliberately low — often intentional
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
    const page = makePage({ url: 'https://example.com/thank-you' })
    const evidence = makeEvidence({ crawlRun: { status: 'partial' }, pages: [page] })

    const findings = analyzeDeadEnds(evidence, contextFor(evidence, true))
    expect(findings.find((f) => f.checkKey === 'dead_end_page')).toBeDefined()
  })

  it('does not evaluate a page that failed to crawl', () => {
    const page = makePage({ url: 'https://example.com/failed', status: 'failed', http_status: null })
    const evidence = makeEvidence({ pages: [page] })
    expect(analyzeDeadEnds(evidence, contextFor(evidence))).toEqual([])
  })
})
