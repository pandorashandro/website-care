import { describe, expect, it } from 'vitest'
import { analyzeBrokenEdges } from '@/lib/architecture/checks/broken-edges'
import { buildPageGraph } from '@/lib/architecture/graph'
import type { AnalyzerContext } from '@/lib/architecture/context'
import { makeEvidence, makePage, linkFrom } from './helpers/architecture-fixtures'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

function contextFor(evidence: CrawlEvidence): AnalyzerContext {
  return { graph: buildPageGraph(evidence), totalAnalyzedPages: evidence.pages.filter((p) => p.status === 'completed').length, isPartialCrawl: false }
}

describe('analyzeBrokenEdges', () => {
  it('flags an internal link to a 404 target with source/target/status evidence', () => {
    const source = makePage({ url: 'https://example.com/home' })
    const target = makePage({ url: 'https://example.com/missing', http_status: 404 })
    const evidence = makeEvidence({ pages: [source, target], links: [linkFrom(source, 'https://example.com/missing')] })

    const findings = analyzeBrokenEdges(evidence, contextFor(evidence))
    const instance = findings.find((f) => f.checkKey === 'internal_link_to_broken_edge')?.affectedPages[0]
    expect(instance?.url).toBe('https://example.com/home')
    expect(instance?.affectedResourceUrl).toBe('https://example.com/missing')
    expect(instance?.currentState?.value).toContain('404')
  })

  it('flags an internal link to a target that failed to fetch entirely', () => {
    const source = makePage({ url: 'https://example.com/home' })
    const target = makePage({ url: 'https://example.com/gone', status: 'failed', http_status: null, error_reason: 'network' })
    const evidence = makeEvidence({ pages: [source, target], links: [linkFrom(source, 'https://example.com/gone')] })

    const findings = analyzeBrokenEdges(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'internal_link_to_broken_edge')).toBeDefined()
  })

  it('never invents a replacement destination — desiredState stays null for a broken target', () => {
    const source = makePage({ url: 'https://example.com/home' })
    const target = makePage({ url: 'https://example.com/missing', http_status: 404 })
    const evidence = makeEvidence({ pages: [source, target], links: [linkFrom(source, 'https://example.com/missing')] })

    const findings = analyzeBrokenEdges(evidence, contextFor(evidence))
    expect(findings[0].affectedPages[0].desiredState).toBeNull()
  })

  it('does not flag a healthy internal link', () => {
    const source = makePage({ url: 'https://example.com/home' })
    const target = makePage({ url: 'https://example.com/about' })
    const evidence = makeEvidence({ pages: [source, target], links: [linkFrom(source, 'https://example.com/about')] })

    expect(analyzeBrokenEdges(evidence, contextFor(evidence))).toEqual([])
  })
})
