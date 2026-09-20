import { describe, expect, it } from 'vitest'
import { analyzeContent } from '@/lib/content/run-analysis'
import { createFakeContentStore } from './helpers/fake-content-store'
import { makeCrawlRun, makePage } from './helpers/architecture-fixtures'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

const CRAWL_RUN_ID = 'crawl-run-1'

describe('analyzeContent — execution, idempotency, isolation', () => {
  it('rejects analysis for a crawl that is still queued or running', async () => {
    for (const status of ['queued', 'running'] as const) {
      const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status }), pages: [], links: [] }
      const store = createFakeContentStore({ [CRAWL_RUN_ID]: evidence })
      const result = await analyzeContent(store, CRAWL_RUN_ID)
      expect(result.ok).toBe(false)
    }
  })

  it('rejects analysis for a crawl_run that does not exist', async () => {
    const store = createFakeContentStore({})
    const result = await analyzeContent(store, 'does-not-exist')
    expect(result.ok).toBe(false)
  })

  it('analyzes a completed crawl and persists findings', async () => {
    const page = makePage({ url: 'https://example.com/services', content_word_count: 10 })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [page], links: [] }
    const store = createFakeContentStore({ [CRAWL_RUN_ID]: evidence })
    const result = await analyzeContent(store, CRAWL_RUN_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.findings.some((f) => f.checkKey === 'substantively_thin_page')).toBe(true)
    expect(result.analysis.analyzer_version).toBe('content-v3')
  })

  it('persists the health score on the analysis row itself', async () => {
    const page = makePage({ url: 'https://example.com/' })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [page], links: [] }
    const store = createFakeContentStore({ [CRAWL_RUN_ID]: evidence })
    const result = await analyzeContent(store, CRAWL_RUN_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.analysis.health_score).toBe(result.health.score)

    const stored = await store.getLatestAnalysis(CRAWL_RUN_ID, result.analysis.analyzer_version)
    expect(stored?.health_score).toBe(result.health.score)
  })

  it('re-running analysis on the same crawl_run replaces findings rather than duplicating them', async () => {
    const page = makePage({ url: 'https://example.com/services', content_word_count: 10 })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [page], links: [] }
    const store = createFakeContentStore({ [CRAWL_RUN_ID]: evidence })

    const first = await analyzeContent(store, CRAWL_RUN_ID)
    const second = await analyzeContent(store, CRAWL_RUN_ID)

    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(second.analysis.id).toBe(first.analysis.id)

    const fakeStore = store as unknown as { _findings: unknown[] }
    const thinFindings = fakeStore._findings.filter((f) => (f as { check_key: string }).check_key === 'substantively_thin_page')
    expect(thinFindings).toHaveLength(1)
  })

  it('removes a stale finding on re-analysis once the underlying evidence no longer reproduces it', async () => {
    const page = makePage({ url: 'https://example.com/services', content_word_count: 10 })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [page], links: [] }
    const store = createFakeContentStore({ [CRAWL_RUN_ID]: evidence })

    const first = await analyzeContent(store, CRAWL_RUN_ID)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.findings.some((f) => f.checkKey === 'substantively_thin_page')).toBe(true)

    evidence.pages = [{ ...page, content_word_count: 300 }]
    const second = await analyzeContent(store, CRAWL_RUN_ID)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.findings.find((f) => f.checkKey === 'substantively_thin_page')).toBeUndefined()
  })

  it('a clean, well-written site produces zero PROBLEM findings and a perfect health score (the always-on, zero-impact page_purpose_summary opportunity is expected)', async () => {
    const pages = Array.from({ length: 4 }, (_, i) =>
      makePage({
        url: `https://example.com/p${i}`,
        title: `Specific Page ${i}`,
        h1_text: `Page ${i} Heading`,
        content_word_count: 200,
        content_paragraph_count: 4,
        content_heading_texts: ['Frequently Asked Questions'],
        content_text: `Unique substantive content for page ${i}, describing exactly what this page covers in real detail.`,
        content_hash: `unique-hash-${i}`,
      })
    )
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages, links: [] }
    const store = createFakeContentStore({ [CRAWL_RUN_ID]: evidence })
    const result = await analyzeContent(store, CRAWL_RUN_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.findings.filter((f) => f.kind === 'problem')).toEqual([])
    expect(result.findings.every((f) => f.checkKey === 'page_purpose_summary')).toBe(true)
    expect(result.health.score).toBe(100)
  })

  it('a partial crawl still produces a valid analysis with page-local findings intact', async () => {
    const page = makePage({ url: 'https://example.com/services', content_word_count: 10 })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'partial' }), pages: [page], links: [] }
    const store = createFakeContentStore({ [CRAWL_RUN_ID]: evidence })
    const result = await analyzeContent(store, CRAWL_RUN_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.findings.some((f) => f.checkKey === 'substantively_thin_page')).toBe(true)
  })

  it('excludes ineligible pages from analysis entirely', async () => {
    const utility = makePage({ url: 'https://example.com/utility?x=1', content_word_count: 5, noindex: true })
    const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }), pages: [utility], links: [] }
    const store = createFakeContentStore({ [CRAWL_RUN_ID]: evidence })
    const result = await analyzeContent(store, CRAWL_RUN_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.findings).toEqual([])
  })
})
