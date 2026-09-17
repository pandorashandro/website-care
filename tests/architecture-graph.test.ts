import { describe, expect, it } from 'vitest'
import { buildPageGraph, inboundCount, outboundCount, inboundSources, outboundTargets, isHomepage } from '@/lib/architecture/graph'
import { makeEvidence, makePage, linkFrom } from './helpers/architecture-fixtures'

describe('buildPageGraph', () => {
  it('computes inbound and outbound counts from internal links', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const about = makePage({ url: 'https://example.com/about' })
    const evidence = makeEvidence({ pages: [home, about], links: [linkFrom(home, 'https://example.com/about')] })

    const graph = buildPageGraph(evidence)
    expect(inboundCount(graph, 'https://example.com/about')).toBe(1)
    expect(outboundCount(graph, 'https://example.com/')).toBe(1)
  })

  it('deduplicates repeated edges from the same source to the same target', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const about = makePage({ url: 'https://example.com/about' })
    const evidence = makeEvidence({
      pages: [home, about],
      links: [linkFrom(home, 'https://example.com/about'), linkFrom(home, 'https://example.com/about')],
    })

    const graph = buildPageGraph(evidence)
    expect(inboundCount(graph, 'https://example.com/about')).toBe(1)
  })

  it('counts distinct SOURCE PAGES for inbound, not raw link occurrences', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const pageA = makePage({ url: 'https://example.com/a' })
    const pageB = makePage({ url: 'https://example.com/b' })
    const target = makePage({ url: 'https://example.com/target' })
    const evidence = makeEvidence({
      pages: [home, pageA, pageB, target],
      links: [linkFrom(pageA, 'https://example.com/target'), linkFrom(pageB, 'https://example.com/target')],
    })

    const graph = buildPageGraph(evidence)
    expect(inboundCount(graph, 'https://example.com/target')).toBe(2)
    expect(inboundSources(graph, 'https://example.com/target').sort()).toEqual(['https://example.com/a', 'https://example.com/b'])
  })

  it('excludes external links entirely from the graph', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const evidence = makeEvidence({
      pages: [home],
      links: [linkFrom(home, 'https://external.example/', { link_type: 'external' })],
    })

    const graph = buildPageGraph(evidence)
    expect(outboundCount(graph, 'https://example.com/')).toBe(0)
    expect(graph.outboundByTarget.has('https://example.com/')).toBe(false)
  })

  it('excludes self-links from both inbound and outbound counts', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const evidence = makeEvidence({ pages: [home], links: [linkFrom(home, 'https://example.com/')] })

    const graph = buildPageGraph(evidence)
    expect(inboundCount(graph, 'https://example.com/')).toBe(0)
    expect(outboundCount(graph, 'https://example.com/')).toBe(0)
  })

  it('identifies the seed (depth 0) page as the homepage', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const other = makePage({ url: 'https://example.com/other', depth: 1 })
    const evidence = makeEvidence({ pages: [home, other] })

    const graph = buildPageGraph(evidence)
    expect(isHomepage(graph, 'https://example.com/')).toBe(true)
    expect(isHomepage(graph, 'https://example.com/other')).toBe(false)
  })

  it('reports zero counts for a page with no recorded links (never throws)', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const evidence = makeEvidence({ pages: [home] })
    const graph = buildPageGraph(evidence)

    expect(inboundCount(graph, 'https://example.com/')).toBe(0)
    expect(outboundCount(graph, 'https://example.com/')).toBe(0)
    expect(outboundTargets(graph, 'https://example.com/')).toEqual([])
  })

  it('reports no homepage when no depth-0 page exists in this evidence', () => {
    const page = makePage({ url: 'https://example.com/orphaned-evidence', depth: 3 })
    const evidence = makeEvidence({ pages: [page] })
    const graph = buildPageGraph(evidence)
    expect(graph.seedUrl).toBeNull()
    expect(isHomepage(graph, 'https://example.com/orphaned-evidence')).toBe(false)
  })

  it('ignores links from a source_page_id that has no corresponding crawl_pages row', () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const evidence = makeEvidence({ pages: [home], links: [linkFrom(home, 'https://example.com/x', { source_page_id: 'does-not-exist' })] })
    const graph = buildPageGraph(evidence)
    expect(inboundCount(graph, 'https://example.com/x')).toBe(0)
  })
})
