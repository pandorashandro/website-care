import { describe, expect, it } from 'vitest'
import { analyzeDeepPages, DEEP_PAGE_DEPTH_THRESHOLD } from '@/lib/architecture/checks/deep-pages'
import { makeEvidence, makePage } from './helpers/architecture-fixtures'

describe('analyzeDeepPages', () => {
  it('flags a page at or beyond the depth threshold', () => {
    const deep = makePage({ url: 'https://example.com/deep', depth: DEEP_PAGE_DEPTH_THRESHOLD, discovered_via: 'link' })
    const evidence = makeEvidence({ pages: [deep] })

    const findings = analyzeDeepPages(evidence)
    const finding = findings.find((f) => f.checkKey === 'deep_page')
    expect(finding).toBeDefined()
    expect(finding?.affectedPages[0].currentState?.value).toContain(String(DEEP_PAGE_DEPTH_THRESHOLD))
  })

  it('does not flag a page just under the threshold (false-positive boundary)', () => {
    const shallow = makePage({ url: 'https://example.com/shallow', depth: DEEP_PAGE_DEPTH_THRESHOLD - 1, discovered_via: 'link' })
    const evidence = makeEvidence({ pages: [shallow] })

    expect(analyzeDeepPages(evidence)).toEqual([])
  })

  it('does not treat a normal shallow page (depth 1-3) as deep', () => {
    const pages = [1, 2, 3].map((depth) => makePage({ url: `https://example.com/level-${depth}`, depth, discovered_via: 'link' }))
    const evidence = makeEvidence({ pages })
    expect(analyzeDeepPages(evidence)).toEqual([])
  })

  it('excludes sitemap-discovered pages, since their recorded depth is always 1 regardless of true navigational depth', () => {
    const sitemapPage = makePage({ url: 'https://example.com/from-sitemap', depth: 1, discovered_via: 'sitemap' })
    const evidence = makeEvidence({ pages: [sitemapPage] })
    expect(analyzeDeepPages(evidence)).toEqual([])
  })

  it('does not evaluate a page that failed to crawl', () => {
    const failed = makePage({ url: 'https://example.com/failed', depth: 10, status: 'failed', http_status: null, discovered_via: 'link' })
    const evidence = makeEvidence({ pages: [failed] })
    expect(analyzeDeepPages(evidence)).toEqual([])
  })
})
