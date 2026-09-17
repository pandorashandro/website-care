import { describe, expect, it } from 'vitest'
import { analyzeArchitecture } from '@/lib/architecture/run-analysis'
import { createFakeArchitectureStore } from './helpers/fake-architecture-store'
import { makeCrawlRun, makePage, linkFrom } from './helpers/architecture-fixtures'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

const CRAWL_RUN_ID = 'crawl-run-1'

describe('analyzeArchitecture — execution, idempotency, isolation (mirrors Technical SEO\'s own contract)', () => {
  it('rejects analysis for a crawl that is still queued or running', async () => {
    for (const status of ['queued', 'running'] as const) {
      const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status }), pages: [], links: [] }
      const store = createFakeArchitectureStore({ [CRAWL_RUN_ID]: evidence })
      const result = await analyzeArchitecture(store, CRAWL_RUN_ID)
      expect(result.ok).toBe(false)
    }
  })

  it('rejects analysis for a crawl_run that does not exist', async () => {
    const store = createFakeArchitectureStore({})
    const result = await analyzeArchitecture(store, 'does-not-exist')
    expect(result.ok).toBe(false)
  })

  it('analyzes a completed crawl and persists findings', async () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const broken = makePage({ url: 'https://example.com/broken', http_status: 404 })
    const evidence: CrawlEvidence = {
      crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }),
      pages: [home, broken],
      links: [linkFrom(home, 'https://example.com/broken')],
    }
    const store = createFakeArchitectureStore({ [CRAWL_RUN_ID]: evidence })
    const result = await analyzeArchitecture(store, CRAWL_RUN_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.findings.some((f) => f.checkKey === 'internal_link_to_broken_edge')).toBe(true)
    expect(result.analysis.analyzer_version).toBe('site-architecture-v3')
  })

  it('persists the health score on the analysis row itself', async () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [home], links: [] }
    const store = createFakeArchitectureStore({ [CRAWL_RUN_ID]: evidence })
    const result = await analyzeArchitecture(store, CRAWL_RUN_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.analysis.health_score).toBe(result.health.score)

    const stored = await store.getLatestAnalysis(CRAWL_RUN_ID, result.analysis.analyzer_version)
    expect(stored?.health_score).toBe(result.health.score)
  })

  it('re-running analysis on the same crawl_run replaces findings rather than duplicating them', async () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const broken = makePage({ url: 'https://example.com/broken', http_status: 404 })
    const evidence: CrawlEvidence = {
      crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }),
      pages: [home, broken],
      links: [linkFrom(home, 'https://example.com/broken')],
    }
    const store = createFakeArchitectureStore({ [CRAWL_RUN_ID]: evidence })

    const first = await analyzeArchitecture(store, CRAWL_RUN_ID)
    const second = await analyzeArchitecture(store, CRAWL_RUN_ID)

    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(second.analysis.id).toBe(first.analysis.id)

    const fakeStore = store as unknown as { _findings: unknown[] }
    const brokenFindings = fakeStore._findings.filter((f) => (f as { check_key: string }).check_key === 'internal_link_to_broken_edge')
    expect(brokenFindings).toHaveLength(1)
  })

  it('removes a stale finding on re-analysis once the underlying evidence no longer reproduces it', async () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const broken = makePage({ url: 'https://example.com/broken', http_status: 404 })
    const evidence: CrawlEvidence = {
      crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }),
      pages: [home, broken],
      links: [linkFrom(home, 'https://example.com/broken')],
    }
    const store = createFakeArchitectureStore({ [CRAWL_RUN_ID]: evidence })

    const first = await analyzeArchitecture(store, CRAWL_RUN_ID)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.findings.some((f) => f.checkKey === 'internal_link_to_broken_edge')).toBe(true)

    evidence.pages = [home, { ...broken, http_status: 200 }]
    const second = await analyzeArchitecture(store, CRAWL_RUN_ID)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.findings.find((f) => f.checkKey === 'internal_link_to_broken_edge')).toBeUndefined()
  })

  it('a clean, well-connected site produces zero findings and a perfect health score', async () => {
    // Every non-homepage page needs enough distinct inbound links to clear
    // the underlinked threshold too, not just a non-zero orphan/dead-end
    // count -- a genuinely healthy small site, not just a minimal one.
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const pages = Array.from({ length: 4 }, (_, i) => makePage({ url: `https://example.com/p${i}`, depth: 1 }))
    const allPages = [home, ...pages]

    const links = [
      // Homepage links to every other page.
      ...pages.map((p) => linkFrom(home, p.url)),
      // Every other page links back to the homepage AND to every sibling,
      // so each has both outbound links (not a dead end) and 4 inbound
      // links (well above the underlinked threshold).
      ...pages.flatMap((p) => allPages.filter((other) => other.url !== p.url).map((other) => linkFrom(p, other.url))),
    ]

    const evidence: CrawlEvidence = {
      crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }),
      pages: allPages,
      links,
    }
    const store = createFakeArchitectureStore({ [CRAWL_RUN_ID]: evidence })
    const result = await analyzeArchitecture(store, CRAWL_RUN_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.findings).toEqual([])
    expect(result.health.score).toBe(100)
  })

  it('a partial crawl still produces a valid analysis, with orphan/underlinked/site-wide checks suppressed', async () => {
    const home = makePage({ url: 'https://example.com/', depth: 0 })
    const maybeOrphan = makePage({ url: 'https://example.com/maybe', discovered_via: 'sitemap' })
    const evidence: CrawlEvidence = {
      crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'partial' }),
      pages: [home, maybeOrphan],
      links: [],
    }
    const store = createFakeArchitectureStore({ [CRAWL_RUN_ID]: evidence })
    const result = await analyzeArchitecture(store, CRAWL_RUN_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.findings.find((f) => f.checkKey === 'orphan_page')).toBeUndefined()
  })
})
