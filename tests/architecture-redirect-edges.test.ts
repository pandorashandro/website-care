import { describe, expect, it } from 'vitest'
import { analyzeRedirectEdges } from '@/lib/architecture/checks/redirect-edges'
import { buildPageGraph } from '@/lib/architecture/graph'
import { aggregateFindings } from '@/lib/architecture/aggregate'
import type { AnalyzerContext } from '@/lib/architecture/context'
import { makeEvidence, makePage, linkFrom } from './helpers/architecture-fixtures'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

function contextFor(evidence: CrawlEvidence): AnalyzerContext {
  return { graph: buildPageGraph(evidence), totalAnalyzedPages: evidence.pages.filter((p) => p.status === 'completed').length, isPartialCrawl: false }
}

describe('analyzeRedirectEdges', () => {
  it('expresses source -> current target -> final destination -> proposed replacement for a redirected edge', () => {
    const source = makePage({ url: 'https://example.com/home' })
    const target = makePage({ url: 'https://example.com/old', final_url: 'https://example.com/new', http_status: 301 })
    const evidence = makeEvidence({ pages: [source, target], links: [linkFrom(source, 'https://example.com/old')] })

    const findings = analyzeRedirectEdges(evidence, contextFor(evidence))
    const instance = findings.find((f) => f.checkKey === 'internal_link_to_redirect_edge')?.affectedPages[0]

    expect(instance?.url).toBe('https://example.com/home')
    expect(instance?.affectedResourceUrl).toBe('https://example.com/old')
    expect(instance?.desiredState?.value).toBe('https://example.com/new')
    expect(instance?.proposedChange).toContain('https://example.com/new')
  })

  it('distinguishes occurrences, source pages, and unique targets correctly (mirrors Technical SEO\'s own real-world fix)', () => {
    const sourceA = makePage({ url: 'https://example.com/a' })
    const sourceB = makePage({ url: 'https://example.com/b' })
    const targetOne = makePage({ url: 'https://example.com/old-1', final_url: 'https://example.com/new-1' })
    const targetTwo = makePage({ url: 'https://example.com/old-2', final_url: 'https://example.com/new-2' })

    const evidence = makeEvidence({
      pages: [sourceA, sourceB, targetOne, targetTwo],
      links: [
        linkFrom(sourceA, 'https://example.com/old-1'),
        linkFrom(sourceA, 'https://example.com/old-2'),
        linkFrom(sourceB, 'https://example.com/old-1'),
        linkFrom(sourceB, 'https://example.com/old-2'),
      ],
    })

    const rawFindings = analyzeRedirectEdges(evidence, contextFor(evidence))
    const aggregated = aggregateFindings(rawFindings, 4)
    const finding = aggregated.find((f) => f.checkKey === 'internal_link_to_redirect_edge')

    expect(finding?.affectedPageCount).toBe(2)
    expect(finding?.uniqueTargetCount).toBe(2)
    expect(finding?.occurrenceCount).toBe(4)
  })

  it('does not flag a link to a page that loads directly (no redirect)', () => {
    const source = makePage({ url: 'https://example.com/home' })
    const target = makePage({ url: 'https://example.com/about', final_url: 'https://example.com/about' })
    const evidence = makeEvidence({ pages: [source, target], links: [linkFrom(source, 'https://example.com/about')] })

    expect(analyzeRedirectEdges(evidence, contextFor(evidence))).toEqual([])
  })

  it('does not flag an external link', () => {
    const source = makePage({ url: 'https://example.com/home' })
    const evidence = makeEvidence({ pages: [source], links: [linkFrom(source, 'https://external.example/x', { link_type: 'external' })] })

    expect(analyzeRedirectEdges(evidence, contextFor(evidence))).toEqual([])
  })
})
