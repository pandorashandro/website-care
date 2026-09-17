import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/scanner/checks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/scanner/checks')>()
  return { ...actual, fetchPage: vi.fn() }
})

import { fetchPage } from '@/lib/scanner/checks'
import { startCrawlRun, processCrawlBatch, selectNewDiscoveries } from '@/lib/crawler/engine'
import { createFakeCrawlStore } from './helpers/fake-crawl-store'

function htmlResult(html: string, overrides: Partial<Awaited<ReturnType<typeof fetchPage>> & { ok: true }> = {}) {
  return {
    ok: true as const,
    html,
    durationMs: 5,
    sizeBytes: html.length,
    finalUrl: overrides.finalUrl ?? 'https://example.com/',
    finalStatus: 200,
    redirectChain: [],
    redirectCount: 0,
    xRobotsTag: null,
    contentType: 'text/html',
    ...overrides,
  }
}

const NO_ROBOTS = { ok: false as const, reason: 'blocked' as const }

describe('startCrawlRun', () => {
  beforeEach(() => {
    vi.mocked(fetchPage).mockReset()
    vi.mocked(fetchPage).mockResolvedValue(NO_ROBOTS as never) // robots.txt + sitemap.xml both "unavailable" by default
  })

  it('creates a queued crawl run seeded with the root URL', async () => {
    const store = createFakeCrawlStore()
    const { crawlRun, alreadyActive } = await startCrawlRun(store, 'website-1', 'https://example.com/')

    expect(alreadyActive).toBe(false)
    expect(crawlRun.status).toBe('queued')
    expect(store._pages).toHaveLength(1)
    expect(store._pages[0]).toMatchObject({ url: 'https://example.com/', depth: 0, discovered_via: 'seed', status: 'queued' })
  })

  it('is idempotent — a second call while a crawl is active returns the SAME run rather than starting a duplicate', async () => {
    const store = createFakeCrawlStore()
    const first = await startCrawlRun(store, 'website-1', 'https://example.com/')
    const second = await startCrawlRun(store, 'website-1', 'https://example.com/')

    expect(second.alreadyActive).toBe(true)
    expect(second.crawlRun.id).toBe(first.crawlRun.id)
    expect(store._runs).toHaveLength(1)
  })

  it('allows a new crawl once the previous one reached a terminal state', async () => {
    const store = createFakeCrawlStore()
    const first = await startCrawlRun(store, 'website-1', 'https://example.com/')
    await store.updateCrawlRun(first.crawlRun.id, { status: 'completed' })

    const second = await startCrawlRun(store, 'website-1', 'https://example.com/')
    expect(second.alreadyActive).toBe(false)
    expect(second.crawlRun.id).not.toBe(first.crawlRun.id)
  })

  it('fails closed with a failed status when the seed URL cannot be normalized', async () => {
    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-1', 'not a url at all')
    expect(crawlRun.status).toBe('failed')
  })

  describe('robots/sitemap outcome persistence (Phase 26)', () => {
    it('persists robots_status/sitemap_status as unreachable when both are unfetchable, with no new network calls beyond what startCrawlRun already made', async () => {
      const store = createFakeCrawlStore()
      const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/')

      const finalRun = await store.getCrawlRun(crawlRun.id)
      expect(finalRun?.robots_status).toBe('unreachable')
      expect(finalRun?.sitemap_status).toBe('unreachable')
      expect(finalRun?.sitemap_url_count).toBe(0)
    })

    it('persists robots_status: not_found when robots.txt returns 404, distinct from a genuine network failure', async () => {
      vi.mocked(fetchPage).mockImplementation(async (url: string) => {
        if (url === 'https://example.com/robots.txt') return htmlResult('', { finalUrl: url, finalStatus: 404 })
        return NO_ROBOTS as never
      })

      const store = createFakeCrawlStore()
      const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/')
      const finalRun = await store.getCrawlRun(crawlRun.id)
      expect(finalRun?.robots_status).toBe('not_found')
    })

    it('persists robots_status: ok and sitemap_status: ok with the correct URL count when both are fetchable', async () => {
      const sitemapXml =
        '<?xml version="1.0"?><urlset><url><loc>https://example.com/a</loc></url><url><loc>https://example.com/b</loc></url></urlset>'

      vi.mocked(fetchPage).mockImplementation(async (url: string) => {
        if (url === 'https://example.com/robots.txt') return htmlResult('User-agent: *', { finalUrl: url, contentType: 'text/plain' })
        if (url === 'https://example.com/sitemap.xml') return htmlResult(sitemapXml, { finalUrl: url, contentType: 'application/xml' })
        return NO_ROBOTS as never
      })

      const store = createFakeCrawlStore()
      const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/')
      const finalRun = await store.getCrawlRun(crawlRun.id)
      expect(finalRun?.robots_status).toBe('ok')
      expect(finalRun?.sitemap_status).toBe('ok')
      expect(finalRun?.sitemap_url_count).toBe(2)
    })

    it('persists sitemap_status: empty when a sitemap file is reachable but has no usable URLs', async () => {
      vi.mocked(fetchPage).mockImplementation(async (url: string) => {
        if (url === 'https://example.com/sitemap.xml') return htmlResult('<?xml version="1.0"?><urlset></urlset>', { finalUrl: url, contentType: 'application/xml' })
        return NO_ROBOTS as never
      })

      const store = createFakeCrawlStore()
      const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/')
      const finalRun = await store.getCrawlRun(crawlRun.id)
      expect(finalRun?.sitemap_status).toBe('empty')
      expect(finalRun?.sitemap_url_count).toBe(0)
    })
  })

  describe('plan-aware crawl budgets (Phase 25B)', () => {
    it('clamps the effective budget to planMaxPages even when a larger amount was requested — a client cannot buy a bigger crawl than its plan allows', async () => {
      const store = createFakeCrawlStore()
      const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/', {
        requestedPageBudget: 1000,
        planMaxPages: 30, // e.g. the Free plan's entitlement
      })

      expect(crawlRun.effective_page_budget).toBe(30)
      // The requested figure is preserved as-is for display/audit — it is
      // never itself the enforced limit.
      expect(crawlRun.requested_page_budget).toBe(1000)
    })

    it('a requested budget already under the plan ceiling is honored exactly', async () => {
      const store = createFakeCrawlStore()
      const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/', {
        requestedPageBudget: 20,
        planMaxPages: 150, // e.g. the Bloom plan's entitlement
      })

      expect(crawlRun.effective_page_budget).toBe(20)
      expect(crawlRun.requested_page_budget).toBe(20)
    })

    it('omitting planMaxPages falls back to the flat product-wide safety ceiling, not an unbounded value', async () => {
      const store = createFakeCrawlStore()
      const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/', { requestedPageBudget: 100000 })

      expect(crawlRun.effective_page_budget).toBe(500) // MAX_CRAWL_PAGES
    })

    it('a planMaxPages larger than the global safety ceiling still cannot exceed the safety ceiling', async () => {
      const store = createFakeCrawlStore()
      const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/', {
        requestedPageBudget: 100000,
        planMaxPages: 999999, // simulates a hypothetically misconfigured plan
      })

      expect(crawlRun.effective_page_budget).toBe(500) // MAX_CRAWL_PAGES still wins
    })
  })
})

describe('processCrawlBatch — persistence, discovery, duplicate prevention, finalization', () => {
  beforeEach(() => {
    vi.mocked(fetchPage).mockReset()
  })

  it('processes the seed page, extracts metadata, and discovers linked pages', async () => {
    vi.mocked(fetchPage).mockImplementation(async (url: string) => {
      if (url === 'https://example.com/') {
        return htmlResult('<title>Home</title><a href="/about">About</a><a href="/about">About again</a>', { finalUrl: 'https://example.com/' })
      }
      if (url === 'https://example.com/about') {
        return htmlResult('<title>About</title>', { finalUrl: 'https://example.com/about' })
      }
      return NO_ROBOTS as never
    })

    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/')
    const outcome = await processCrawlBatch(store, crawlRun.id)

    expect(outcome.status).toBe('completed')
    expect(outcome.done).toBe(true)

    const seedPage = store._pages.find((p) => p.url === 'https://example.com/')
    expect(seedPage?.status).toBe('completed')
    expect(seedPage?.title).toBe('Home')

    // The same /about link appears twice in the source HTML but must only
    // ever produce ONE crawl_pages row (duplicate prevention).
    const aboutPages = store._pages.filter((p) => p.url === 'https://example.com/about')
    expect(aboutPages).toHaveLength(1)
    expect(aboutPages[0].status).toBe('completed')
    expect(aboutPages[0].title).toBe('About')
  })

  it('persists the redirect count fetchPage reports for a completed page (Phase 26 evidence)', async () => {
    vi.mocked(fetchPage).mockImplementation(async (url: string) => {
      if (url === 'https://example.com/') return htmlResult('<title>Home</title>', { finalUrl: 'https://example.com/', redirectCount: 3 })
      return NO_ROBOTS as never
    })

    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/')
    await processCrawlBatch(store, crawlRun.id)

    const seedPage = store._pages.find((p) => p.url === 'https://example.com/')
    expect(seedPage?.redirect_count).toBe(3)
  })

  it('persists the extracted meta description for a completed HTML page (Phase 28 real-world evidence validation, Observation 3)', async () => {
    vi.mocked(fetchPage).mockImplementation(async (url: string) => {
      if (url === 'https://example.com/') {
        return htmlResult('<title>Home</title><meta name="description" content="A page-specific summary describing this page.">', {
          finalUrl: 'https://example.com/',
        })
      }
      return NO_ROBOTS as never
    })

    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/')
    await processCrawlBatch(store, crawlRun.id)

    const seedPage = store._pages.find((p) => p.url === 'https://example.com/')
    expect(seedPage?.meta_description).toBe('A page-specific summary describing this page.')
  })

  it('persists null meta_description when no meta description tag is present (genuine absence, not an extraction/persistence bug)', async () => {
    vi.mocked(fetchPage).mockImplementation(async (url: string) => {
      if (url === 'https://example.com/') return htmlResult('<title>Home</title><p>No meta description here.</p>', { finalUrl: 'https://example.com/' })
      return NO_ROBOTS as never
    })

    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/')
    await processCrawlBatch(store, crawlRun.id)

    const seedPage = store._pages.find((p) => p.url === 'https://example.com/')
    expect(seedPage?.meta_description).toBeNull()
  })

  it('persists h1_count for a completed HTML page (Phase 28 evidence)', async () => {
    vi.mocked(fetchPage).mockImplementation(async (url: string) => {
      if (url === 'https://example.com/') return htmlResult('<title>Home</title><h1>One</h1><h1>Two</h1>', { finalUrl: 'https://example.com/' })
      return NO_ROBOTS as never
    })

    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/')
    await processCrawlBatch(store, crawlRun.id)

    const seedPage = store._pages.find((p) => p.url === 'https://example.com/')
    expect(seedPage?.h1_count).toBe(2)
    expect(seedPage?.h1_text).toBe('One')
  })

  it('persists h1_count 0 for a non-HTML resource (e.g. an extensionless PDF that still reaches fetchPage)', async () => {
    vi.mocked(fetchPage).mockImplementation(async (url: string) => {
      if (url === 'https://example.com/') return htmlResult('<title>Home</title><a href="/document">doc</a>', { finalUrl: 'https://example.com/' })
      if (url === 'https://example.com/document') {
        return {
          ok: true as const,
          html: '%PDF-1.4',
          durationMs: 5,
          sizeBytes: 8,
          finalUrl: 'https://example.com/document',
          finalStatus: 200,
          redirectChain: [],
          redirectCount: 0,
          xRobotsTag: null,
          contentType: 'application/pdf',
        }
      }
      return NO_ROBOTS as never
    })

    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/')
    await processCrawlBatch(store, crawlRun.id)
    await processCrawlBatch(store, crawlRun.id)

    const docPage = store._pages.find((p) => p.url === 'https://example.com/document')
    expect(docPage?.h1_count).toBe(0)
  })

  it('does not destroy the crawl when one page fails — other pages still process, run still completes', async () => {
    vi.mocked(fetchPage).mockImplementation(async (url: string) => {
      if (url === 'https://example.com/') {
        return htmlResult('<a href="/broken">broken</a><a href="/fine">fine</a>', { finalUrl: 'https://example.com/' })
      }
      if (url === 'https://example.com/broken') {
        return { ok: false as const, reason: 'network' as const }
      }
      if (url === 'https://example.com/fine') {
        return htmlResult('<title>Fine</title>', { finalUrl: 'https://example.com/fine' })
      }
      return NO_ROBOTS as never
    })

    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/')
    const outcome = await processCrawlBatch(store, crawlRun.id)

    expect(outcome.status).toBe('completed')

    const brokenPage = store._pages.find((p) => p.url === 'https://example.com/broken')
    const finePage = store._pages.find((p) => p.url === 'https://example.com/fine')
    expect(brokenPage?.status).toBe('failed')
    expect(finePage?.status).toBe('completed')

    const finalRun = await store.getCrawlRun(crawlRun.id)
    expect(finalRun?.pages_failed).toBe(1)
    expect(finalRun?.pages_succeeded).toBe(2)
  })

  it('enforces the page budget: reaching it marks the run partial and skips remaining queued pages', async () => {
    vi.mocked(fetchPage).mockImplementation(async (url: string) => {
      if (url === 'https://example.com/') {
        return htmlResult('<a href="/a">a</a><a href="/b">b</a><a href="/c">c</a>', { finalUrl: 'https://example.com/' })
      }
      return htmlResult('<title>leaf</title>', { finalUrl: url })
    })

    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/', { requestedPageBudget: 2 })
    const outcome = await processCrawlBatch(store, crawlRun.id)

    expect(outcome.status).toBe('partial')

    const finalRun = await store.getCrawlRun(crawlRun.id)
    expect(finalRun?.pages_processed).toBe(2)
    expect(finalRun?.status).toBe('partial')
    expect(store._pages.some((p) => p.status === 'skipped')).toBe(true)
  })

  it('reaching the budget exactly as the last discoverable page finishes is a completion, not a partial result', async () => {
    vi.mocked(fetchPage).mockImplementation(async (url: string) => {
      if (url === 'https://example.com/') {
        return htmlResult('<a href="/a">a</a>', { finalUrl: 'https://example.com/' })
      }
      return htmlResult('<title>leaf</title>', { finalUrl: url })
    })

    const store = createFakeCrawlStore()
    // Exactly 2 discoverable pages (root + /a) against a budget of 2 —
    // nothing is ever left queued or skipped, so this must resolve
    // 'completed', unlike the budget test above where 2 of 4 discoverable
    // pages are genuinely left behind ('partial').
    const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/', { requestedPageBudget: 2 })
    const outcome = await processCrawlBatch(store, crawlRun.id)

    expect(outcome.status).toBe('completed')
    const finalRun = await store.getCrawlRun(crawlRun.id)
    expect(finalRun?.status).toBe('completed')
    expect(store._pages.some((p) => p.error_reason === 'crawl_page_budget_reached')).toBe(false)
  })

  it('calling processCrawlBatch again on an already-terminal run is a safe no-op', async () => {
    vi.mocked(fetchPage).mockResolvedValue(htmlResult('<title>Home</title>', { finalUrl: 'https://example.com/' }))

    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/')
    await processCrawlBatch(store, crawlRun.id)
    const pagesAfterFirstRun = store._pages.length

    const second = await processCrawlBatch(store, crawlRun.id)
    expect(second.done).toBe(true)
    expect(second.pagesProcessedThisInvocation).toBe(0)
    expect(store._pages.length).toBe(pagesAfterFirstRun)
  })

  it('throws for a crawl run id that does not exist', async () => {
    const store = createFakeCrawlStore()
    await expect(processCrawlBatch(store, 'does-not-exist')).rejects.toThrow()
  })

  it('two overlapping invocations of the same crawl (a double-clicked "Continue Scan") never lose progress — counters are recomputed fresh, not accumulated from a stale read', async () => {
    vi.mocked(fetchPage).mockImplementation(async (url: string) => {
      if (url === 'https://example.com/') {
        return htmlResult('<a href="/a">a</a><a href="/b">b</a><a href="/c">c</a><a href="/d">d</a>', { finalUrl: 'https://example.com/' })
      }
      return htmlResult('<title>leaf</title>', { finalUrl: url })
    })

    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/', { requestedPageBudget: 50 })

    // Both invocations read the crawl run's initial state before either
    // has processed anything (the actual shape a race takes: two requests
    // starting from the same stale snapshot). If counters were still
    // locally accumulated (the pre-fix design), whichever invocation's
    // final updateCrawlRun call landed last would silently overwrite the
    // other's progress.
    const [first, second] = await Promise.all([processCrawlBatch(store, crawlRun.id), processCrawlBatch(store, crawlRun.id)])

    const finalRun = await store.getCrawlRun(crawlRun.id)
    const completedPages = store._pages.filter((p) => p.status === 'completed' || p.status === 'failed').length

    // Every page that was actually claimed by EITHER invocation must be
    // reflected in the final persisted count — none of it silently lost.
    expect(finalRun?.pages_processed).toBe(completedPages)
    expect(finalRun?.status).toBe('completed')
    expect(first.pagesProcessedThisInvocation + second.pagesProcessedThisInvocation).toBe(completedPages)
  })
})

describe('resumability', () => {
  beforeEach(() => {
    vi.mocked(fetchPage).mockReset()
  })

  it('a page abandoned mid-claim (simulating a crashed prior invocation) becomes reclaimable and completes on the next call', async () => {
    vi.mocked(fetchPage).mockResolvedValue(NO_ROBOTS as never)
    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/')

    // Simulate a previous invocation that claimed the seed page and then
    // crashed before ever persisting a result: status='processing' with a
    // claimed_at far enough in the past to count as stale.
    const seedPage = store._pages[0]
    seedPage.status = 'processing'
    seedPage.claimed_at = new Date(Date.now() - 60 * 60_000).toISOString() // 1 hour ago

    vi.mocked(fetchPage).mockResolvedValueOnce(NO_ROBOTS as never) // robots.txt lookup inside the batch
    vi.mocked(fetchPage).mockResolvedValueOnce(htmlResult('<title>Recovered</title>', { finalUrl: 'https://example.com/' }))

    const outcome = await processCrawlBatch(store, crawlRun.id)

    expect(outcome.status).toBe('completed')
    expect(store._pages[0].status).toBe('completed')
    expect(store._pages[0].title).toBe('Recovered')
  })

  it('reprocessing a reclaimed page (its links were already persisted before an abandoned claim) does not create duplicate graph edges', async () => {
    vi.mocked(fetchPage).mockResolvedValue(NO_ROBOTS as never)
    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/')

    const seedPage = store._pages[0]
    // Simulate: the FIRST attempt already persisted this page's discovered
    // link before crashing (the engine persists discoveries/links before
    // marking the page 'completed' precisely so this can happen safely —
    // see processOnePage's own doc comment), leaving the page itself
    // still 'processing' and stale.
    store._links.push({ crawl_run_id: crawlRun.id, source_page_id: seedPage.id, target_url: 'https://example.com/about', target_page_id: null, link_type: 'internal', anchor_text: null })
    seedPage.status = 'processing'
    seedPage.claimed_at = new Date(Date.now() - 60 * 60_000).toISOString()

    vi.mocked(fetchPage).mockResolvedValueOnce(NO_ROBOTS as never) // robots.txt
    vi.mocked(fetchPage).mockResolvedValueOnce(htmlResult('<a href="/about">About</a>', { finalUrl: 'https://example.com/' }))
    vi.mocked(fetchPage).mockResolvedValueOnce(htmlResult('<title>About</title>', { finalUrl: 'https://example.com/about' }))

    await processCrawlBatch(store, crawlRun.id)

    const edgesToAbout = store._links.filter((l) => l.source_page_id === seedPage.id && l.target_url === 'https://example.com/about')
    expect(edgesToAbout).toHaveLength(1)
  })

  it('a batch that stops due to its wall-clock budget leaves queued work for the next invocation to finish', async () => {
    vi.mocked(fetchPage).mockImplementation(async (url: string) => {
      if (url === 'https://example.com/') {
        return htmlResult('<a href="/a">a</a><a href="/b">b</a>', { finalUrl: 'https://example.com/' })
      }
      return htmlResult('<title>leaf</title>', { finalUrl: url })
    })

    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/')

    // A budget of 0ms means the while-loop's own time check fails before
    // claiming anything at all in this invocation — a deterministic way to
    // force "did no work, more remains" without depending on real timing.
    const firstInvocation = await processCrawlBatch(store, crawlRun.id, { batchWallClockBudgetMs: 0 })

    expect(firstInvocation.done).toBe(false)
    expect(firstInvocation.status).toBe('running')
    expect(firstInvocation.pagesProcessedThisInvocation).toBe(0)
    expect(store._pages.every((p) => p.status === 'queued')).toBe(true) // nothing lost, nothing corrupted

    const secondInvocation = await processCrawlBatch(store, crawlRun.id)
    expect(secondInvocation.done).toBe(true)
    expect(secondInvocation.status).toBe('completed')
  })
})

describe('security — discovered links and expansion limits (Phase 25B, Checkpoint 8)', () => {
  beforeEach(() => {
    vi.mocked(fetchPage).mockReset()
  })

  it('a discovered link that the shared fetchPage security guard blocks fails safely — it is never treated as a successful fetch, and it cannot crash or bypass the rest of the batch', async () => {
    vi.mocked(fetchPage).mockImplementation(async (url: string) => {
      if (url === 'https://example.com/') {
        return htmlResult('<a href="/internal-looking-but-blocked">bad</a><a href="/fine">fine</a>', { finalUrl: 'https://example.com/' })
      }
      if (url === 'https://example.com/internal-looking-but-blocked') {
        // Every crawl_pages row — seed or discovered — is fetched through
        // the SAME fetchPage function (lib/scanner/checks.ts), which is the
        // actual SSRF enforcement point (see tests/crawler-security.test.ts
        // for that function's own guarantees). This simulates it correctly
        // rejecting a same-host-looking but disallowed target.
        return { ok: false as const, reason: 'blocked' as const }
      }
      if (url === 'https://example.com/fine') {
        return htmlResult('<title>Fine</title>', { finalUrl: 'https://example.com/fine' })
      }
      return NO_ROBOTS as never
    })

    const store = createFakeCrawlStore()
    const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/')
    const outcome = await processCrawlBatch(store, crawlRun.id)

    expect(outcome.status).toBe('completed') // the one blocked page does not take down the run
    const blockedPage = store._pages.find((p) => p.url === 'https://example.com/internal-looking-but-blocked')
    expect(blockedPage?.status).toBe('failed')
    expect(blockedPage?.error_reason).toBe('blocked')
    const finePage = store._pages.find((p) => p.url === 'https://example.com/fine')
    expect(finePage?.status).toBe('completed')
  })

  it('caps discovered outbound links per page at MAX_LINKS_PER_PAGE, even when a page offers far more', async () => {
    const manyLinks = Array.from({ length: 1000 }, (_, i) => `<a href="/p${i}">p${i}</a>`).join('')

    vi.mocked(fetchPage).mockImplementation(async (url: string) => {
      if (url === 'https://example.com/') {
        return htmlResult(`<title>Hub</title>${manyLinks}`, { finalUrl: 'https://example.com/' })
      }
      return htmlResult('<title>leaf</title>', { finalUrl: url })
    })

    const store = createFakeCrawlStore()
    // A generous budget so the cap under test is MAX_LINKS_PER_PAGE, not
    // the page budget — this isolates the one limit this test is about.
    const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/', { requestedPageBudget: 500 })
    await processCrawlBatch(store, crawlRun.id)

    // 1 root + at most 200 (MAX_LINKS_PER_PAGE) discovered leaves — a
    // pathological single page can never explode the frontier past this
    // per-page ceiling in one step.
    expect(store._pages.length).toBeLessThanOrEqual(201)
    expect(store._pages.length).toBeGreaterThan(1)
  })

  it('depth beyond max_depth is never queued, bounding how far a chain of discoveries can expand the frontier', async () => {
    vi.mocked(fetchPage).mockImplementation(async (url: string) => {
      const match = url.match(/\/d(\d+)$/)
      const depth = match ? Number(match[1]) : 0
      return htmlResult(`<title>d${depth}</title><a href="/d${depth + 1}">deeper</a>`, { finalUrl: url })
    })

    const store = createFakeCrawlStore()
    // max_depth defaults to 5 (DEFAULT_CRAWL_DEPTH) when not requested.
    const { crawlRun } = await startCrawlRun(store, 'website-1', 'https://example.com/d0', { requestedPageBudget: 500 })
    let outcome = await processCrawlBatch(store, crawlRun.id)
    let iterations = 1
    while (!outcome.done && iterations < 50) {
      outcome = await processCrawlBatch(store, crawlRun.id)
      iterations++
    }

    const maxDiscoveredDepth = Math.max(...store._pages.map((p) => p.depth))
    expect(maxDiscoveredDepth).toBeLessThanOrEqual(5)
    expect(outcome.status).toBe('completed') // bounded by depth, not by hitting the page budget
  })
})

describe('selectNewDiscoveries', () => {
  it('respects the max-depth ceiling', () => {
    const result = selectNewDiscoveries(['https://example.com/a'], 5, 5, 'example.com', () => false)
    expect(result).toEqual([])
  })

  it('excludes already-known URLs', () => {
    const result = selectNewDiscoveries(['https://example.com/a', 'https://example.com/b'], 0, 5, 'example.com', (url) => url.endsWith('/a'))
    expect(result.map((d) => d.url)).toEqual(['https://example.com/b'])
  })

  it('excludes off-site and non-page URLs', () => {
    const result = selectNewDiscoveries(['https://other.example/a', 'https://example.com/logo.png', 'https://example.com/real'], 0, 5, 'example.com', () => false)
    expect(result.map((d) => d.url)).toEqual(['https://example.com/real'])
  })

  it('increments depth by one for each discovery', () => {
    const result = selectNewDiscoveries(['https://example.com/a'], 2, 5, 'example.com', () => false)
    expect(result[0].depth).toBe(3)
  })
})
