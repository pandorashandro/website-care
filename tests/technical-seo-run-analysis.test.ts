import { describe, expect, it } from 'vitest'
import { analyzeTechnicalSeo } from '@/lib/technical-seo/run-analysis'
import { buildTechnicalSeoCategorySummary } from '@/app/dashboard/websites/[id]/technical-seo-summary'
import { createFakeTechnicalSeoStore } from './helpers/fake-technical-seo-store'
import { makeCrawlRun, makePage, makeLink } from './helpers/technical-seo-fixtures'
import type { CrawlEvidence } from '@/lib/technical-seo/evidence'

const CRAWL_RUN_ID = 'crawl-run-1'

describe('analyzeTechnicalSeo — execution, idempotency, and isolation (Checkpoint 9)', () => {
  it('rejects analysis for a crawl that is still queued or running', async () => {
    for (const status of ['queued', 'running'] as const) {
      const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status }), pages: [], links: [] }
      const store = createFakeTechnicalSeoStore({ [CRAWL_RUN_ID]: evidence })
      const result = await analyzeTechnicalSeo(store, CRAWL_RUN_ID)
      expect(result.ok).toBe(false)
    }
  })

  it('rejects analysis for a crawl that never produced usable evidence (failed/cancelled)', async () => {
    for (const status of ['failed', 'cancelled'] as const) {
      const evidence: CrawlEvidence = { crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status }), pages: [], links: [] }
      const store = createFakeTechnicalSeoStore({ [CRAWL_RUN_ID]: evidence })
      const result = await analyzeTechnicalSeo(store, CRAWL_RUN_ID)
      expect(result.ok).toBe(false)
    }
  })

  it('rejects analysis for a crawl_run that does not exist, without throwing', async () => {
    const store = createFakeTechnicalSeoStore({})
    const result = await analyzeTechnicalSeo(store, 'does-not-exist')
    expect(result.ok).toBe(false)
  })

  it('analyzes a completed crawl and persists findings', async () => {
    const evidence: CrawlEvidence = {
      crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }),
      pages: [makePage({ url: 'https://example.com/', http_status: 404 })],
      links: [],
    }
    const store = createFakeTechnicalSeoStore({ [CRAWL_RUN_ID]: evidence })
    const result = await analyzeTechnicalSeo(store, CRAWL_RUN_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.findings.some((f) => f.checkKey === 'internal_page_4xx')).toBe(true)
    expect(result.analysis.status).toBe('completed')
  })

  it('persists the health score on the analysis row itself — the ONE authoritative value every reader (Overview, the dedicated page) selects verbatim (Checkpoint 12)', async () => {
    const evidence: CrawlEvidence = {
      crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }),
      pages: [makePage({ url: 'https://example.com/', http_status: 500 })],
      links: [],
    }
    const store = createFakeTechnicalSeoStore({ [CRAWL_RUN_ID]: evidence })
    const result = await analyzeTechnicalSeo(store, CRAWL_RUN_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // The score returned to the caller and the score persisted on the
    // stored analysis row must be the exact same number — never computed
    // twice, never allowed to drift.
    expect(result.analysis.health_score).toBe(result.health.score)

    const stored = await store.getLatestAnalysis(CRAWL_RUN_ID, result.analysis.analyzer_version)
    expect(stored?.health_score).toBe(result.health.score)
  })

  it('also analyzes a partial crawl (page-limit-truncated) — a partial crawl still has real evidence worth analyzing', async () => {
    const evidence: CrawlEvidence = {
      crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'partial' }),
      pages: [makePage({ url: 'https://example.com/', noindex: true })],
      links: [],
    }
    const store = createFakeTechnicalSeoStore({ [CRAWL_RUN_ID]: evidence })
    const result = await analyzeTechnicalSeo(store, CRAWL_RUN_ID)
    expect(result.ok).toBe(true)
  })

  it('re-running analysis on the same crawl_run replaces findings rather than duplicating them (idempotent re-analysis)', async () => {
    const evidence: CrawlEvidence = {
      crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }),
      pages: [makePage({ url: 'https://example.com/', http_status: 404 })],
      links: [],
    }
    const store = createFakeTechnicalSeoStore({ [CRAWL_RUN_ID]: evidence })

    const first = await analyzeTechnicalSeo(store, CRAWL_RUN_ID)
    const second = await analyzeTechnicalSeo(store, CRAWL_RUN_ID)

    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    // Same analysis row (same crawl_run_id + analyzer_version), not a
    // growing history of separate analysis attempts.
    expect(second.analysis.id).toBe(first.analysis.id)

    const fakeStore = store as unknown as { _findings: unknown[] }
    const fourOhFourFindings = fakeStore._findings.filter((f) => (f as { check_key: string }).check_key === 'internal_page_4xx')
    expect(fourOhFourFindings).toHaveLength(1) // not 2 — the re-run replaced, not appended
  })

  it('removes a stale finding on re-analysis once the underlying page evidence no longer reproduces it (the site got fixed)', async () => {
    const evidence: CrawlEvidence = {
      crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }),
      pages: [makePage({ url: 'https://example.com/', http_status: 404 })],
      links: [],
    }
    const store = createFakeTechnicalSeoStore({ [CRAWL_RUN_ID]: evidence })

    const first = await analyzeTechnicalSeo(store, CRAWL_RUN_ID)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.findings.some((f) => f.checkKey === 'internal_page_4xx')).toBe(true)

    // Simulate a fresh crawl_run whose evidence now shows the page fully
    // fixed (including a canonical tag, so no OTHER finding fires either)
    // — re-analysis must not leave the old 404 finding lingering.
    evidence.pages = [makePage({ url: 'https://example.com/', http_status: 200, canonical_url: 'https://example.com/' })]

    const second = await analyzeTechnicalSeo(store, CRAWL_RUN_ID)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.findings).toEqual([])

    const fakeStore = store as unknown as { _findings: unknown[] }
    const remainingForThisAnalysis = fakeStore._findings.filter((f) => (f as { crawl_analysis_id: string }).crawl_analysis_id === second.analysis.id)
    expect(remainingForThisAnalysis).toHaveLength(0)
  })

  it('produces byte-identical findings across repeated analysis of unchanged evidence (deterministic)', async () => {
    const evidence: CrawlEvidence = {
      crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }),
      pages: [
        makePage({ url: 'https://example.com/', http_status: 200 }),
        makePage({ url: 'https://example.com/broken', http_status: 500 }),
      ],
      links: [],
    }
    const store = createFakeTechnicalSeoStore({ [CRAWL_RUN_ID]: evidence })

    const first = await analyzeTechnicalSeo(store, CRAWL_RUN_ID)
    const second = await analyzeTechnicalSeo(store, CRAWL_RUN_ID)
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    const strip = (findings: typeof first.findings) => findings.map((f) => ({ ...f }))
    expect(strip(second.findings)).toEqual(strip(first.findings))
  })

  it('a clean, fully healthy site produces zero findings and a perfect health score (proves the engine does not invent issues)', async () => {
    const homepage = makePage({ url: 'https://example.com/', depth: 0, discovered_via: 'sitemap', canonical_url: 'https://example.com/' })
    const about = makePage({ url: 'https://example.com/about', depth: 1, discovered_via: 'sitemap', canonical_url: 'https://example.com/about' })
    const evidence: CrawlEvidence = {
      crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed', robots_status: 'ok', sitemap_status: 'ok', sitemap_url_count: 2 }),
      pages: [homepage, about],
      links: [makeLink({ source_page_id: homepage.id, target_url: 'https://example.com/about' })],
    }
    const store = createFakeTechnicalSeoStore({ [CRAWL_RUN_ID]: evidence })

    const result = await analyzeTechnicalSeo(store, CRAWL_RUN_ID)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.findings).toEqual([])
    expect(result.health.score).toBe(100)
  })

  it('one analyzer throwing on a single bad page does not prevent other analyzers from producing their own findings (isolation)', async () => {
    // canonical_url is read ONLY by analyzeCanonicals — no other analyzer
    // touches it — so a getter that throws when read breaks exactly that
    // one analyzer's pass over this page, without affecting
    // analyzeCrawlability (which independently flags the same page's 5xx
    // status). This exercises the REAL try/catch in run-analysis.ts, not a
    // simulation of it.
    // Must be a successful (2xx) page so analyzeCanonicals' own filtering
    // actually reaches the canonical_url read — a failed/error-status page
    // is excluded from that filter before canonical_url is ever touched.
    const brokenCanonicalPage = makePage({ url: 'https://example.com/broken-canonical', http_status: 200 })
    Object.defineProperty(brokenCanonicalPage, 'canonical_url', {
      get() {
        throw new Error('simulated analyzer bug reading canonical_url')
      },
    })
    const serverErrorPage = makePage({ url: 'https://example.com/server-error', http_status: 500 })

    const evidence: CrawlEvidence = {
      crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed' }),
      pages: [brokenCanonicalPage, serverErrorPage],
      links: [],
    }
    const store = createFakeTechnicalSeoStore({ [CRAWL_RUN_ID]: evidence })

    const result = await analyzeTechnicalSeo(store, CRAWL_RUN_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // analyzeCanonicals threw and was skipped — no canonical-category
    // finding — but analyzeCrawlability's independent 5xx finding survived.
    expect(result.findings.some((f) => f.category === 'canonicals')).toBe(false)
    expect(result.findings.some((f) => f.checkKey === 'internal_page_5xx')).toBe(true)
  })
})

/**
 * Blocked-crawl Technical SEO correction (2026-09-22, follow-up) — the
 * founder-verified defect: internal_page_4xx/5xx, robots_unreachable, and
 * sitemap_unavailable were being scored as three-to-four INDEPENDENT,
 * CONFIRMED website defects even when the real cause was webioom's own
 * crawler being blocked from the entire site — triple-penalizing one
 * underlying access-denial event, and preventing Technical SEO from ever
 * reporting `not_analyzed` the way every other pillar honestly does when
 * it has zero genuine evidence.
 */
describe('analyzeTechnicalSeo — blocked-crawl scoring correction (2026-09-22, follow-up)', () => {
  it('REGRESSION — a blanket 403 (the exact reported shape: seed blocked, robots/sitemap unreachable, 0 eligible HTML) suppresses ALL FOUR consequence findings and ends up not_analyzed with NO numeric score — never a fabricated ~76', async () => {
    const blockedHomepage = makePage({ url: 'https://example.com/', depth: 0, http_status: 403, noindex: true })
    const evidence: CrawlEvidence = {
      crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed', robots_status: 'unreachable', sitemap_status: 'unreachable' }),
      pages: [blockedHomepage],
      links: [],
    }
    const store = createFakeTechnicalSeoStore({ [CRAWL_RUN_ID]: evidence })

    const result = await analyzeTechnicalSeo(store, CRAWL_RUN_ID)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Zero CONFIRMED findings persisted — not internal_page_4xx, not
    // robots_unreachable, not sitemap_unavailable, not the (already-fixed)
    // noindex/important_page_non_indexable misattribution either.
    expect(result.findings).toEqual([])
    expect(result.coverage.level).toBe('none')
    expect(result.coverage.siteAccessState).toBe('blocked')

    // The RAW persisted health_score is still the same harmless "100 from
    // zero findings" every other engine's hollow score already is — the
    // coverage-aware override (proven below) is what actually matters to
    // a customer, exactly mirroring On-Page/Architecture/Pillars.
    expect(result.analysis.health_score).toBe(100)

    // The customer-facing category summary — what Overview, Overall
    // Website Health, and monitoring all actually consume — must be
    // not_analyzed with NO numeric score, never "analyzed, score ≈76".
    const summary = buildTechnicalSeoCategorySummary({ id: CRAWL_RUN_ID, status: 'completed' }, result.analysis)
    expect(summary.status).toBe('not_analyzed')
    expect(summary.score).toBeNull()
  })

  it('a blanket fetch failure (every page failed at the transport level, 0 pages of any kind) also ends up not_analyzed with no numeric score', async () => {
    const evidence: CrawlEvidence = {
      crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed', robots_status: 'unreachable', sitemap_status: 'unreachable' }),
      pages: [makePage({ url: 'https://example.com/', status: 'failed', http_status: null })],
      links: [],
    }
    const store = createFakeTechnicalSeoStore({ [CRAWL_RUN_ID]: evidence })

    const result = await analyzeTechnicalSeo(store, CRAWL_RUN_ID)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.coverage.level).toBe('none')
    expect(result.coverage.siteAccessState).toBe('fetch_failed')

    const summary = buildTechnicalSeoCategorySummary({ id: CRAWL_RUN_ID, status: 'completed' }, result.analysis)
    expect(summary.status).toBe('not_analyzed')
    expect(summary.score).toBeNull()
  })

  it("PRESERVED — the spec's own accessible-crawl example (homepage/about/services 200, one genuine /old-page 404) still produces the normal internal_page_4xx finding and a real deduction — isolated evidence on an otherwise-accessible crawl is never suppressed", async () => {
    const evidence: CrawlEvidence = {
      crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed', robots_status: 'ok', sitemap_status: 'ok' }),
      pages: [
        makePage({ url: 'https://example.com/', depth: 0, http_status: 200, canonical_url: 'https://example.com/' }),
        makePage({ url: 'https://example.com/about', depth: 1, http_status: 200, canonical_url: 'https://example.com/about' }),
        makePage({ url: 'https://example.com/services', depth: 1, http_status: 200, canonical_url: 'https://example.com/services' }),
        makePage({ url: 'https://example.com/old-page', depth: 1, http_status: 404 }),
      ],
      links: [],
    }
    const store = createFakeTechnicalSeoStore({ [CRAWL_RUN_ID]: evidence })

    const result = await analyzeTechnicalSeo(store, CRAWL_RUN_ID)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.coverage.siteAccessState).toBe('accessible')
    expect(result.coverage.level).toBe('adequate')

    const notFoundFinding = result.findings.find((f) => f.checkKey === 'internal_page_4xx')
    expect(notFoundFinding).toBeDefined()
    expect(notFoundFinding?.affectedPages.map((p) => p.url)).toEqual(['https://example.com/old-page'])
    expect(result.health.score).toBeLessThan(100) // a real deduction, not suppressed

    const summary = buildTechnicalSeoCategorySummary({ id: CRAWL_RUN_ID, status: 'completed' }, result.analysis)
    expect(summary.status).toBe('analyzed')
    expect(summary.score).toBe(result.health.score)
  })

  it('an isolated 403 amid an otherwise-accessible crawl (webioom clearly CAN reach the site — one page just happens to 403) is NOT suppressed, since siteAccessState is partially_accessible, not blocked', async () => {
    const evidence: CrawlEvidence = {
      crawlRun: makeCrawlRun({ id: CRAWL_RUN_ID, status: 'completed', robots_status: 'ok', sitemap_status: 'ok' }),
      pages: [
        makePage({ url: 'https://example.com/', depth: 0, http_status: 200, canonical_url: 'https://example.com/' }),
        makePage({ url: 'https://example.com/admin', depth: 1, http_status: 403 }),
      ],
      links: [],
    }
    const store = createFakeTechnicalSeoStore({ [CRAWL_RUN_ID]: evidence })

    const result = await analyzeTechnicalSeo(store, CRAWL_RUN_ID)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.coverage.siteAccessState).toBe('partially_accessible')
    expect(result.coverage.level).toBe('adequate')
    expect(result.findings.some((f) => f.checkKey === 'internal_page_4xx')).toBe(true)
  })
})
