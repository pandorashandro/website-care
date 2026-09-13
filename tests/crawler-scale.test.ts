import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/scanner/checks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/scanner/checks')>()
  return { ...actual, fetchPage: vi.fn() }
})

import { fetchPage } from '@/lib/scanner/checks'
import { startCrawlRun, processCrawlBatch } from '@/lib/crawler/engine'
import { createFakeCrawlStore } from './helpers/fake-crawl-store'

/**
 * Phase 25B, Checkpoint 7 — deterministic 500-page scale/resumability
 * validation. Everything here runs against tests/helpers/fake-crawl-store.ts
 * (no live Supabase) and a fully mocked fetchPage (no real network) — a
 * synthetic same-host site is generated in-process, never a real public
 * website. `lib/crawler/sitemap.ts`'s own file/depth/URL-count bounds
 * (MAX_SITEMAP_FILES/MAX_SITEMAP_INDEX_DEPTH/MAX_URLS_FROM_SITEMAPS) already
 * have dedicated unit coverage in tests/crawler-sitemap.test.ts; this file's
 * "sitemap expansion" assertions instead confirm the ENGINE's own behavior
 * when a sitemap offers more URLs than a crawl's budget allows.
 */

const ORIGIN = 'https://scale.example'
const SEED = `${ORIGIN}/`
const ROBOTS_DISALLOWED_PATH = '/leaf-0005'
const REDIRECT_LOOP_PATH = '/leaf-0010'
const NETWORK_FAIL_PATHS = new Set(['/leaf-0020', '/leaf-0021', '/leaf-0022'])

function leafUrl(n: number): string {
  return `${ORIGIN}/leaf-${String(n).padStart(4, '0')}`
}

function leafPath(n: number): string {
  return `/leaf-${String(n).padStart(4, '0')}`
}

function htmlResult(html: string, finalUrl: string, contentType = 'text/html') {
  return {
    ok: true as const,
    html,
    durationMs: 1,
    sizeBytes: html.length,
    finalUrl,
    finalStatus: 200,
    redirectChain: [],
    redirectCount: 0,
    xRobotsTag: null,
    contentType,
  }
}

function buildSitemapXml(leafCount: number): string {
  const locs = Array.from({ length: leafCount }, (_, i) => `<loc>${leafUrl(i + 1)}</loc>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs}</urlset>`
}

/**
 * A synthetic site: one root page plus `leafCount` leaf pages, all seeded
 * via a single sitemap.xml (so pages_discovered is deterministic and
 * independent of MAX_LINKS_PER_PAGE). Every leaf ALSO links back to the
 * root and to the "next" leaf — both already-known URLs by the time any
 * leaf is processed — specifically to exercise duplicate-discovery at
 * scale: hundreds of redundant re-discovery attempts must never create a
 * second crawl_pages row for the same (crawl_run_id, url).
 */
function mockScaleSite(leafCount: number) {
  vi.mocked(fetchPage).mockImplementation(async (url: string) => {
    if (url === `${ORIGIN}/robots.txt`) {
      return htmlResult(`User-agent: *\nDisallow: ${ROBOTS_DISALLOWED_PATH}`, `${ORIGIN}/robots.txt`, 'text/plain') as never
    }
    if (url === `${ORIGIN}/sitemap.xml`) {
      return htmlResult(buildSitemapXml(leafCount), `${ORIGIN}/sitemap.xml`, 'application/xml') as never
    }
    if (url === SEED) {
      return htmlResult('<title>Home</title>', SEED) as never
    }

    const match = url.match(/\/leaf-(\d{4})$/)
    if (match) {
      const n = Number(match[1])
      const path = leafPath(n)

      if (path === REDIRECT_LOOP_PATH) return { ok: false as const, reason: 'redirect_loop' as const }
      if (NETWORK_FAIL_PATHS.has(path)) return { ok: false as const, reason: 'network' as const }

      const nextLeaf = n < leafCount ? `<a href="${leafUrl(n + 1)}">next</a>` : ''
      return htmlResult(`<title>Leaf ${n}</title><a href="/">home</a>${nextLeaf}`, url) as never
    }

    return { ok: false as const, reason: 'network' as const }
  })
}

async function runToCompletion(store: ReturnType<typeof createFakeCrawlStore>, crawlRunId: string) {
  let outcome = await processCrawlBatch(store, crawlRunId)
  let iterations = 1
  while (!outcome.done && iterations < 1000) {
    outcome = await processCrawlBatch(store, crawlRunId)
    iterations++
  }
  return { outcome, iterations }
}

describe('500-page site-wide crawl — deterministic scale validation (Phase 25B, Checkpoint 7)', () => {
  beforeEach(() => {
    vi.mocked(fetchPage).mockReset()
  })

  it('reaches the effective budget exactly and marks the run partial, skipping only what never got claimed', async () => {
    const LEAF_COUNT = 500 // + the root page itself = 501 discoverable pages
    mockScaleSite(LEAF_COUNT)

    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-scale', SEED, { requestedPageBudget: 500 })

    // Sitemap discovery must have actually worked before any batch runs —
    // asserting this early turns a silent sitemap-mock mismatch into an
    // obvious failure here rather than a confusing budget assertion below.
    expect(store._pages).toHaveLength(LEAF_COUNT + 1)
    expect(crawlRun.effective_page_budget).toBe(500)

    const { outcome } = await runToCompletion(store, crawlRun.id)
    const finalRun = await store.getCrawlRun(crawlRun.id)

    expect(outcome.status).toBe('partial')
    expect(finalRun?.status).toBe('partial')
    expect(finalRun?.pages_processed).toBe(500)
    expect(finalRun?.pages_processed).toBeLessThanOrEqual(finalRun?.effective_page_budget ?? 0)

    // Exactly the one page that never fit within budget is left skipped for
    // that reason; no page is ever left mid-flight ('processing') or
    // unaccounted for.
    const stuckProcessing = store._pages.filter((p) => p.status === 'processing')
    expect(stuckProcessing).toHaveLength(0)
    const budgetSkipped = store._pages.filter((p) => p.status === 'skipped' && p.error_reason === 'crawl_page_budget_reached')
    expect(budgetSkipped).toHaveLength(1)

    // Progress counters reconcile exactly against the underlying rows.
    const succeeded = store._pages.filter((p) => p.status === 'completed').length
    const failed = store._pages.filter((p) => p.status === 'failed').length
    expect(finalRun?.pages_succeeded).toBe(succeeded)
    expect(finalRun?.pages_failed).toBe(failed)
    expect(finalRun?.pages_discovered).toBe(LEAF_COUNT + 1)
  })

  it('reaches status completed (not partial) when every discovered page fits within the budget', async () => {
    const LEAF_COUNT = 499 // + root = exactly 500 discoverable pages, matching the 500-page budget
    mockScaleSite(LEAF_COUNT)

    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-scale', SEED, { requestedPageBudget: 500 })
    expect(store._pages).toHaveLength(LEAF_COUNT + 1)

    const { outcome } = await runToCompletion(store, crawlRun.id)
    const finalRun = await store.getCrawlRun(crawlRun.id)

    expect(outcome.status).toBe('completed')
    expect(finalRun?.status).toBe('completed')
    expect(finalRun?.pages_processed).toBe(LEAF_COUNT + 1)
    expect(store._pages.some((p) => p.error_reason === 'crawl_page_budget_reached')).toBe(false)
  })

  it('isolates network failures, a redirect loop, and a robots-disallowed page from each other and from the rest of the crawl', async () => {
    const LEAF_COUNT = 499
    mockScaleSite(LEAF_COUNT)

    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-scale', SEED, { requestedPageBudget: 500 })
    await runToCompletion(store, crawlRun.id)

    for (const path of NETWORK_FAIL_PATHS) {
      const page = store._pages.find((p) => p.url === `${ORIGIN}${path}`)
      expect(page?.status).toBe('failed')
      expect(page?.error_reason).toBe('network')
    }

    const redirectLoopPage = store._pages.find((p) => p.url === `${ORIGIN}${REDIRECT_LOOP_PATH}`)
    expect(redirectLoopPage?.status).toBe('failed')
    expect(redirectLoopPage?.error_reason).toBe('redirect_loop')

    const robotsPage = store._pages.find((p) => p.url === `${ORIGIN}${ROBOTS_DISALLOWED_PATH}`)
    expect(robotsPage?.status).toBe('skipped')
    expect(robotsPage?.error_reason).toBe('disallowed_by_robots')

    // A handful of page-level failures must never take down the run itself.
    const finalRun = await store.getCrawlRun(crawlRun.id)
    expect(finalRun?.status).toBe('completed')
    // The robots-disallowed page WAS actually claimed/attempted, so (unlike
    // a budget skip) it counts toward pages_processed.
    const attemptedCount = (finalRun?.pages_succeeded ?? 0) + (finalRun?.pages_failed ?? 0) + 1 // +1 for the robots skip
    expect(finalRun?.pages_processed).toBe(attemptedCount)
  })

  it('never creates a duplicate crawl_pages row despite every leaf rediscovering already-known URLs', async () => {
    const LEAF_COUNT = 499
    mockScaleSite(LEAF_COUNT)

    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-scale', SEED, { requestedPageBudget: 500 })
    await runToCompletion(store, crawlRun.id)

    // Every one of the ~499 leaves discovers the root URL again ("home"),
    // and all but the last also discover the next leaf (already sitemap-
    // seeded) — hundreds of redundant discovery attempts that must all
    // collapse onto the SAME existing rows.
    expect(store._pages).toHaveLength(LEAF_COUNT + 1)
    const urls = store._pages.map((p) => p.url)
    expect(new Set(urls).size).toBe(urls.length) // no duplicate URLs at all

    // Link edges are equally duplicate-safe: each leaf attempts the same
    // (source, target) edge only once per processing attempt, deduped by
    // (crawl_run_id, source_page_id, target_url).
    const edgeKeys = store._links.map((l) => `${l.source_page_id}|${l.target_url}`)
    expect(new Set(edgeKeys).size).toBe(edgeKeys.length)
  })

  it('an interrupted invocation (zero wall-clock budget) leaves a large crawl untouched, and later invocations resume it correctly', async () => {
    const LEAF_COUNT = 499
    mockScaleSite(LEAF_COUNT)

    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-scale', SEED, { requestedPageBudget: 500 })

    const interrupted = await processCrawlBatch(store, crawlRun.id, { batchWallClockBudgetMs: 0 })
    expect(interrupted.done).toBe(false)
    expect(interrupted.pagesProcessedThisInvocation).toBe(0)
    expect(store._pages.every((p) => p.status === 'queued')).toBe(true)

    // A second "interruption" changes nothing further — repeated no-op
    // invocations are safe, not just a single one.
    const interruptedAgain = await processCrawlBatch(store, crawlRun.id, { batchWallClockBudgetMs: 0 })
    expect(interruptedAgain.pagesProcessedThisInvocation).toBe(0)
    expect(store._pages.every((p) => p.status === 'queued')).toBe(true)

    const { outcome } = await runToCompletion(store, crawlRun.id)
    expect(outcome.status).toBe('completed')
    expect(store._pages.every((p) => p.status === 'completed' || p.status === 'failed' || p.status === 'skipped')).toBe(true)
  })

  it('reclaims stale processing pages left behind by a crashed prior invocation, even at scale', async () => {
    const LEAF_COUNT = 499
    mockScaleSite(LEAF_COUNT)

    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-scale', SEED, { requestedPageBudget: 500 })

    // Simulate 20 pages that a previous invocation claimed and then
    // crashed on, well past STALE_CLAIM_MINUTES.
    const staleBatch = store._pages.slice(0, 20)
    const staleAt = new Date(Date.now() - 60 * 60_000).toISOString()
    for (const page of staleBatch) {
      page.status = 'processing'
      page.claimed_at = staleAt
    }

    const { outcome } = await runToCompletion(store, crawlRun.id)
    expect(outcome.status).toBe('completed')

    for (const page of staleBatch) {
      const current = store._pages.find((p) => p.id === page.id)
      expect(['completed', 'failed', 'skipped']).toContain(current?.status)
    }
    expect(store._pages.some((p) => p.status === 'processing')).toBe(false)
  })

  it('starting a new crawl after a large one finished creates a fresh, independent run ("Scan Again")', async () => {
    const LEAF_COUNT = 500
    mockScaleSite(LEAF_COUNT)

    const store = createFakeCrawlStore()
    const first = await startCrawlRun(store, 'website-scale', SEED, { requestedPageBudget: 500 })
    await runToCompletion(store, first.crawlRun.id)

    const firstFinal = await store.getCrawlRun(first.crawlRun.id)
    expect(firstFinal?.status).toBe('partial')

    const second = await startCrawlRun(store, 'website-scale', SEED, { requestedPageBudget: 500 })
    expect(second.alreadyActive).toBe(false)
    expect(second.crawlRun.id).not.toBe(first.crawlRun.id)
    expect(second.crawlRun.pages_processed).toBe(0)

    // The first run's rows are completely untouched by the second run
    // starting — crawl_pages uniqueness is scoped per crawl_run_id, not
    // globally, so the same URLs can legitimately be re-crawled.
    const firstRunPagesAfter = store._pages.filter((p) => p.crawl_run_id === first.crawlRun.id)
    expect(firstRunPagesAfter).toHaveLength(LEAF_COUNT + 1)
    expect(firstRunPagesAfter.every((p) => p.status !== 'queued')).toBe(true)

    await runToCompletion(store, second.crawlRun.id)
    const secondFinal = await store.getCrawlRun(second.crawlRun.id)
    expect(secondFinal?.status).toBe('partial')
    expect(secondFinal?.pages_processed).toBe(500)
  })
})
