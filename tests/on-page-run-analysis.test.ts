import { describe, expect, it } from 'vitest'
import { analyzeOnPage } from '@/lib/on-page/run-analysis'
import { createFakeOnPageStore } from './helpers/fake-on-page-store'
import { makeCrawlRun, makePage } from './helpers/architecture-fixtures'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

const CRAWL_RUN_ID = 'crawl-run-1'

describe('analyzeOnPage — execution, idempotency, isolation', () => {
  it('rejects analysis for a crawl that is still queued or running', async () => {
    for (const status of ['queued', 'running'] as const) {
      const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status }), pages: [], links: [] }
      const store = createFakeOnPageStore({ [CRAWL_RUN_ID]: evidence })
      const result = await analyzeOnPage(store, CRAWL_RUN_ID)
      expect(result.ok).toBe(false)
    }
  })

  it('rejects analysis for a crawl_run that does not exist', async () => {
    const store = createFakeOnPageStore({})
    const result = await analyzeOnPage(store, 'does-not-exist')
    expect(result.ok).toBe(false)
  })

  it('analyzes a completed crawl and persists findings', async () => {
    const page = makePage({ url: 'https://example.com/', title: null })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [page], links: [] }
    const store = createFakeOnPageStore({ [CRAWL_RUN_ID]: evidence })
    const result = await analyzeOnPage(store, CRAWL_RUN_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.findings.some((f) => f.checkKey === 'missing_title')).toBe(true)
    expect(result.analysis.analyzer_version).toBe('on-page-v1')
  })

  it('persists the health score on the analysis row itself', async () => {
    const page = makePage({ url: 'https://example.com/' })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [page], links: [] }
    const store = createFakeOnPageStore({ [CRAWL_RUN_ID]: evidence })
    const result = await analyzeOnPage(store, CRAWL_RUN_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.analysis.health_score).toBe(result.health.score)

    const stored = await store.getLatestAnalysis(CRAWL_RUN_ID, result.analysis.analyzer_version)
    expect(stored?.health_score).toBe(result.health.score)
  })

  it('re-running analysis on the same crawl_run replaces findings rather than duplicating them', async () => {
    const page = makePage({ url: 'https://example.com/', title: null })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [page], links: [] }
    const store = createFakeOnPageStore({ [CRAWL_RUN_ID]: evidence })

    const first = await analyzeOnPage(store, CRAWL_RUN_ID)
    const second = await analyzeOnPage(store, CRAWL_RUN_ID)

    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(second.analysis.id).toBe(first.analysis.id)

    const fakeStore = store as unknown as { _findings: unknown[] }
    const missingTitleFindings = fakeStore._findings.filter((f) => (f as { check_key: string }).check_key === 'missing_title')
    expect(missingTitleFindings).toHaveLength(1)
  })

  it('removes a stale finding on re-analysis once the underlying evidence no longer reproduces it', async () => {
    const page = makePage({ url: 'https://example.com/', title: null })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [page], links: [] }
    const store = createFakeOnPageStore({ [CRAWL_RUN_ID]: evidence })

    const first = await analyzeOnPage(store, CRAWL_RUN_ID)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.findings.some((f) => f.checkKey === 'missing_title')).toBe(true)

    evidence.pages = [{ ...page, title: 'A perfectly reasonable, specific page title here' }]
    const second = await analyzeOnPage(store, CRAWL_RUN_ID)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.findings.find((f) => f.checkKey === 'missing_title')).toBeUndefined()
  })

  it('a clean, well-optimized site produces zero findings and a perfect health score', async () => {
    const pages = Array.from({ length: 4 }, (_, i) =>
      makePage({
        url: `https://example.com/p${i}`,
        title: `A Specific And Descriptive Page Title Number ${i}`,
        meta_description: `A page-specific summary describing exactly what page number ${i} is about, in enough detail.`,
        h1_text: `Descriptive Heading For Page ${i}`,
        h1_count: 1,
      })
    )
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages, links: [] }
    const store = createFakeOnPageStore({ [CRAWL_RUN_ID]: evidence })
    const result = await analyzeOnPage(store, CRAWL_RUN_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.findings).toEqual([])
    expect(result.health.score).toBe(100)
  })

  it('a partial crawl still produces a valid analysis with page-local findings intact', async () => {
    const page = makePage({ url: 'https://example.com/', title: null })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'partial' }), pages: [page], links: [] }
    const store = createFakeOnPageStore({ [CRAWL_RUN_ID]: evidence })
    const result = await analyzeOnPage(store, CRAWL_RUN_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.findings.some((f) => f.checkKey === 'missing_title')).toBe(true)
  })

  it('excludes ineligible pages from analysis entirely', async () => {
    const utility = makePage({ url: 'https://example.com/utility?x=1', title: null, noindex: true })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [utility], links: [] }
    const store = createFakeOnPageStore({ [CRAWL_RUN_ID]: evidence })
    const result = await analyzeOnPage(store, CRAWL_RUN_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.findings).toEqual([])
  })
})
