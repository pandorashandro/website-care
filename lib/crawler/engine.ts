import { fetchPage } from '@/lib/scanner/checks'
import { extractInternalLinks } from '@/lib/scanner/url-utils'
import { normalizeCrawlUrl, isCrawlableSameSiteUrl } from './url-policy'
import { extractPageMetadata } from './page-extract'
import { extractContentEvidence } from './content-extract'
import { extractPerformanceEvidence, extractAccessibilityEvidence, extractSecurityEvidence, emptyPerformanceEvidence, emptyAccessibilityEvidence, emptySecurityEvidence } from './pillar-extract'
import { fetchRobotsRules, isPathAllowed, type RobotsRules } from './robots'
import { discoverSitemapUrls } from './sitemap'
import {
  clampPageBudget,
  clampDepth,
  BATCH_SIZE,
  BATCH_WALL_CLOCK_BUDGET_MS,
  STALE_CLAIM_MINUTES,
  MAX_LINKS_PER_PAGE,
  BUDGET_SKIP_REASON,
  UNREACHABLE_SKIP_REASON,
  isCrawlRunTimedOut,
  isCrawlPresumedUnreachable,
} from './limits'
import type { CrawlStore } from './store'
import type { CrawlRunRow, CrawlRunStatus, CrawlPageRow, CrawlLinkInsert, DiscoveredUrl } from './types'

/**
 * Phase 25A — the crawler engine. Everything here is pure orchestration
 * over a `CrawlStore` (see store.ts's own doc comment for why): no direct
 * Supabase dependency, so this file's logic is fully testable against the
 * in-memory fake store in tests/helpers/fake-crawl-store.ts.
 *
 * DELIBERATELY NOT a background worker or a long-running process — there
 * is no queue consumer, no cron dispatcher, no persistent Node process in
 * this codebase's actual infrastructure (Next.js on serverless functions),
 * and this phase does not add one. `processCrawlBatch` does a BOUNDED
 * amount of work (BATCH_WALL_CLOCK_BUDGET_MS wall-clock, well under a
 * typical serverless function's time limit) and returns; the persisted
 * frontier (crawl_pages.status) is what makes calling it again later —
 * from a fresh request, fresh process, fresh serverless invocation — pick
 * up exactly where the last call left off. Phase 25B decides how those
 * repeated invocations are actually triggered in production (a "Continue
 * Crawl" UI action, a scheduled re-invocation, etc.) — this phase only
 * provides the resumable primitive itself.
 */

const TERMINAL_STATUSES: ReadonlySet<CrawlRunStatus> = new Set(['completed', 'partial', 'failed', 'cancelled'])

export type StartCrawlOptions = {
  requestedPageBudget?: number
  maxDepth?: number
  /**
   * Phase 25B — the caller's resolved plan crawl-page ceiling (from
   * lib/entitlements/plans.ts's `maxCrawlPages`), derived server-side by
   * the caller (app/dashboard/websites/[id]/crawl-actions.ts) from the
   * CURRENT session's own entitlements — never accepted as a value from the
   * browser. Defaults to MAX_CRAWL_PAGES (clampPageBudget's own default)
   * when omitted, so this engine has no plan awareness of its own: it only
   * ever enforces whatever ceiling it is told, exactly like every other
   * limit in this file.
   */
  planMaxPages?: number
}

export type StartCrawlResult = { crawlRun: CrawlRunRow; alreadyActive: boolean }

/**
 * Starts a new crawl for `websiteId`/`seedUrl`, or returns the
 * already-active one if the website has a queued/running crawl already
 * (idempotent-by-website, backed by the migration's own partial unique
 * index as the ultimate guarantee — this check is the fast, common-case
 * path, not the only enforcement). Seeds the frontier with the root URL
 * plus a best-effort sitemap discovery pass; sitemap discovery failing
 * never fails crawl start — it is a discovery AID, not a requirement (the
 * BFS link-following that happens during processCrawlBatch still finds
 * every reachable page even with zero sitemap data).
 */
export async function startCrawlRun(store: CrawlStore, websiteId: string, seedUrl: string, options?: StartCrawlOptions): Promise<StartCrawlResult> {
  const existing = await store.findActiveCrawlRun(websiteId)
  if (existing) return { crawlRun: existing, alreadyActive: true }

  const effectivePageBudget = clampPageBudget(options?.requestedPageBudget ?? 0, options?.planMaxPages)
  const requestedPageBudget =
    options?.requestedPageBudget && Number.isFinite(options.requestedPageBudget) && options.requestedPageBudget > 0
      ? Math.floor(options.requestedPageBudget)
      : effectivePageBudget
  const maxDepth = clampDepth(options?.maxDepth)

  const crawlRun = await store.createCrawlRun({
    websiteId,
    requestedPageBudget: Math.max(requestedPageBudget, effectivePageBudget),
    effectivePageBudget,
    maxDepth,
  })

  const normalizedSeed = normalizeCrawlUrl(seedUrl, seedUrl)
  if (!normalizedSeed) {
    await store.updateCrawlRun(crawlRun.id, {
      status: 'failed',
      failure_summary: 'The website URL could not be normalized into a crawlable form.',
      completed_at: new Date().toISOString(),
    })
    return { crawlRun: { ...crawlRun, status: 'failed' }, alreadyActive: false }
  }

  await store.upsertQueuedPages([
    { crawlRunId: crawlRun.id, websiteId, url: normalizedSeed, discoveredUrl: seedUrl !== normalizedSeed ? seedUrl : null, depth: 0, discoveredVia: 'seed' },
  ])

  try {
    const hostname = new URL(normalizedSeed).hostname
    const origin = new URL(normalizedSeed).origin
    const robotsResult = await fetchRobotsRules(origin)
    const sitemapUrlsFromRobots = robotsResult.ok ? robotsResult.rules.sitemapUrls : []
    const sitemapDiscovery = await discoverSitemapUrls(normalizedSeed, sitemapUrlsFromRobots)

    const sitemapPages = sitemapDiscovery.urls
      .map((url) => normalizeCrawlUrl(url, normalizedSeed))
      .filter((url): url is string => !!url && isCrawlableSameSiteUrl(url, hostname))
      .slice(0, effectivePageBudget)
      .map((url) => ({ crawlRunId: crawlRun.id, websiteId, url, discoveredUrl: null, depth: 1, discoveredVia: 'sitemap' as const }))

    await store.upsertQueuedPages(sitemapPages)

    // Phase 26: persist the OUTCOME of the robots.txt fetch and sitemap
    // discovery pass this function was already performing — no new network
    // call, just recording what happened so Technical SEO analysis has
    // real site-wide evidence instead of re-fetching robots.txt/sitemap.xml
    // a second time. Best-effort like everything else in this try block: if
    // this write fails, the crawl itself is unaffected (these columns are
    // nullable for exactly this reason).
    const robotsStatus: NonNullable<CrawlRunRow['robots_status']> = robotsResult.ok
      ? 'ok'
      : robotsResult.reason === 'not_found'
        ? 'not_found'
        : 'unreachable'
    const sitemapStatus: NonNullable<CrawlRunRow['sitemap_status']> =
      sitemapDiscovery.urls.length > 0 ? 'ok' : sitemapDiscovery.reachable ? 'empty' : 'unreachable'

    await store.updateCrawlRun(crawlRun.id, {
      robots_status: robotsStatus,
      sitemap_status: sitemapStatus,
      sitemap_url_count: sitemapDiscovery.urls.length,
    })
  } catch {
    // Best-effort only — see module doc comment. Link-following discovery
    // during processCrawlBatch does not depend on this having succeeded.
  }

  return { crawlRun, alreadyActive: false }
}

export type BatchOutcome = {
  /** True when this crawl run reached a terminal state (completed/partial/failed/cancelled) as of this call. False means the frontier still has work and the caller should invoke processCrawlBatch again. */
  done: boolean
  status: CrawlRunStatus
  pagesProcessedThisInvocation: number
}

function safeUrlParts(url: string): { hostname: string; origin: string; path: string } | null {
  try {
    const parsed = new URL(url)
    return { hostname: parsed.hostname, origin: parsed.origin, path: `${parsed.pathname}${parsed.search}` }
  } catch {
    return null
  }
}

/**
 * Filters a page's discovered outbound links down to same-site,
 * crawlable, not-already-known URLs at `depth + 1`, bounded by
 * MAX_LINKS_PER_PAGE. Pure and independently testable — `alreadyQueuedOrKnown`
 * is a caller-supplied membership check (backed by the store's own
 * (crawl_run_id, url) uniqueness in production; a plain Set in tests) so
 * this function never needs its own database access.
 */
export function selectNewDiscoveries(links: string[], depth: number, maxDepth: number, hostname: string, alreadyQueuedOrKnown: (url: string) => boolean): DiscoveredUrl[] {
  if (depth >= maxDepth) return []

  const selected: DiscoveredUrl[] = []
  const seenThisPage = new Set<string>()

  for (const link of links) {
    if (selected.length >= MAX_LINKS_PER_PAGE) break
    if (!isCrawlableSameSiteUrl(link, hostname)) continue
    if (seenThisPage.has(link) || alreadyQueuedOrKnown(link)) continue

    seenThisPage.add(link)
    selected.push({ url: link, depth: depth + 1, discoveredVia: 'link' })
  }

  return selected
}

type PageOutcome = 'succeeded' | 'failed' | 'skipped'

async function processOnePage(store: CrawlStore, page: CrawlPageRow, maxDepth: number, robotsRules: RobotsRules | null): Promise<PageOutcome> {
  const urlParts = safeUrlParts(page.url)

  if (!urlParts) {
    await store.updatePage(page.id, { status: 'failed', error_reason: 'malformed_url', fetched_at: new Date().toISOString() })
    return 'failed'
  }

  if (robotsRules && !isPathAllowed(robotsRules, urlParts.path)) {
    await store.updatePage(page.id, { status: 'skipped', robots_allowed: false, error_reason: 'disallowed_by_robots', fetched_at: new Date().toISOString() })
    return 'skipped'
  }

  const result = await fetchPage(page.url)

  if (!result.ok) {
    await store.updatePage(page.id, {
      status: 'failed',
      robots_allowed: robotsRules ? true : null,
      error_reason: result.reason,
      fetched_at: new Date().toISOString(),
    })
    return 'failed'
  }

  const isHtml = !result.contentType || result.contentType.toLowerCase().includes('html')
  const metadata = isHtml
    ? extractPageMetadata(result.html, result.finalUrl, result.xRobotsTag)
    : {
        title: null,
        metaDescription: null,
        h1Text: null,
        h1Count: 0,
        canonicalUrl: null,
        noindex: false,
        structuredDataPresent: false,
        structuredDataValid: null,
        structuredDataError: null,
        hreflangTags: [],
      }

  // Phase 29 — reuses the SAME already-fetched HTML (no second fetch, no
  // headless browser); see lib/crawler/content-extract.ts's own doc comment
  // for why these compact fields were chosen over persisting raw HTML.
  const contentEvidence = isHtml
    ? extractContentEvidence(result.html)
    : { contentText: null, contentWordCount: 0, contentParagraphCount: 0, contentHeadingTexts: [], contentHash: null, contentExtractionConfidence: 'high' as const }

  // Unified webioom engine, Prompt 2 — same reasoning as contentEvidence
  // above: reuses the SAME already-fetched HTML/response, no new network
  // call. Security's isHttps fact is still meaningful even for a non-HTML
  // resource (derived from the URL alone), so its "empty" variant still
  // computes that one field for real rather than defaulting it.
  const performanceEvidence = isHtml ? extractPerformanceEvidence(result.html, result.responseHeaders) : emptyPerformanceEvidence()
  const accessibilityEvidence = isHtml ? extractAccessibilityEvidence(result.html) : emptyAccessibilityEvidence()
  const securityEvidence = isHtml ? extractSecurityEvidence(result.html, result.finalUrl, result.responseHeaders) : emptySecurityEvidence(result.finalUrl)

  // Discoveries are computed and PERSISTED BEFORE this page is marked
  // 'completed' — deliberately, for resumability: this page's row is the
  // ONLY record that its outbound links were ever extracted (it will never
  // be re-claimed/re-fetched once terminal), so if the process were to
  // crash between these two writes, marking 'completed' first would
  // silently and permanently lose every link this page discovered. Persisting
  // discoveries first means the worst case of a crash in between is
  // re-processing this one page again next invocation (safe — claimPages'
  // stale-reclaim already tolerates that), never losing discovered URLs.
  //
  // Note: how many of these discoveries turned out to be genuinely NEW
  // pages (as opposed to already-known URLs rediscovered from a different
  // page) is intentionally not tracked here at all — pages_discovered is
  // derived from an actual crawl_pages row count (recomputeCrawlRunCounts),
  // never from a per-page tally, specifically because a per-page tally
  // would double-count a URL discovered from two different source pages
  // even though upsertQueuedPages' ON CONFLICT DO NOTHING only ever
  // creates one row for it.
  if (isHtml && result.finalStatus >= 200 && result.finalStatus < 300) {
    const outboundLinks = extractInternalLinks(result.html, result.finalUrl, urlParts.hostname)
      .map((link) => normalizeCrawlUrl(link, result.finalUrl))
      .filter((link): link is string => !!link)

    // Application-level, per-page dedup only — the AUTHORITATIVE dedup
    // guarantee is the database's own (crawl_run_id, url) unique constraint
    // via upsertQueuedPages' ON CONFLICT DO NOTHING semantics, which also
    // correctly handles a link rediscovered from a DIFFERENT page later in
    // the same run (something a per-page Set alone could never catch).
    const discoveries = selectNewDiscoveries(outboundLinks, page.depth, maxDepth, urlParts.hostname, () => false)

    if (discoveries.length > 0) {
      await store.upsertQueuedPages(
        discoveries.map((d) => ({ crawlRunId: page.crawl_run_id, websiteId: page.website_id, url: d.url, discoveredUrl: null, depth: d.depth, discoveredVia: d.discoveredVia }))
      )
    }

    const linkRows: CrawlLinkInsert[] = outboundLinks.slice(0, MAX_LINKS_PER_PAGE).map((targetUrl) => ({
      crawl_run_id: page.crawl_run_id,
      source_page_id: page.id,
      target_url: targetUrl,
      target_page_id: null,
      link_type: 'internal',
      anchor_text: null,
    }))

    if (linkRows.length > 0) await store.insertLinks(linkRows)
  }

  await store.updatePage(page.id, {
    status: 'completed',
    final_url: result.finalUrl,
    http_status: result.finalStatus,
    content_type: result.contentType,
    canonical_url: metadata.canonicalUrl,
    robots_allowed: true,
    noindex: metadata.noindex,
    title: metadata.title,
    meta_description: metadata.metaDescription,
    h1_text: metadata.h1Text,
    h1_count: metadata.h1Count,
    response_time_ms: result.durationMs,
    response_size_bytes: result.sizeBytes,
    redirect_count: result.redirectCount,
    structured_data_present: metadata.structuredDataPresent,
    structured_data_valid: metadata.structuredDataValid,
    structured_data_error: metadata.structuredDataError,
    hreflang_tags: metadata.hreflangTags,
    content_text: contentEvidence.contentText,
    content_word_count: contentEvidence.contentWordCount,
    content_paragraph_count: contentEvidence.contentParagraphCount,
    content_heading_texts: contentEvidence.contentHeadingTexts,
    content_hash: contentEvidence.contentHash,
    content_extraction_confidence: contentEvidence.contentExtractionConfidence,
    performance_evidence: performanceEvidence,
    accessibility_evidence: accessibilityEvidence,
    security_evidence: securityEvidence,
    fetched_at: new Date().toISOString(),
  })

  return 'succeeded'
}

/**
 * Processes one bounded batch of the frontier for `crawlRunId`. See this
 * module's own doc comment for the execution model this implements.
 * Never throws for a single bad page — a page-level failure is persisted
 * as `status: 'failed'` on that row and the batch continues; only a
 * missing crawl run itself is a thrown error (a genuine caller mistake,
 * not a crawl-time failure).
 */
export type ProcessCrawlBatchOptions = {
  /** Overrides BATCH_WALL_CLOCK_BUDGET_MS — production callers never need this; it exists so tests can force a deterministic mid-crawl stop without waiting on real wall-clock time. */
  batchWallClockBudgetMs?: number
}

/**
 * Engine-hardening pass (2026-09-24): the one place every natural
 * completion path (budget-reached, frontier-exhausted, timed-out,
 * presumed-unreachable) funnels through to decide the run's terminal
 * status — never `'completed'` or `'partial'` when literally nothing was
 * ever successfully fetched, because a scan that produced zero usable
 * evidence was not meaningfully audited, whatever its page-accounting
 * otherwise looks like (see the "CRAWL RELIABILITY" product requirement:
 * "If the site cannot be meaningfully audited, fail the scan rather than
 * inventing a score"). A zero-evidence run gets an explicit,
 * customer-legible `failure_summary` instead of a bare status change.
 */
function resolveTerminalStatus(candidateStatus: 'completed' | 'partial', counts: { pagesSucceeded: number }): { status: CrawlRunStatus; failureSummary: string | null } {
  if (counts.pagesSucceeded === 0) {
    return {
      status: 'failed',
      failureSummary: 'webioom could not successfully fetch any page from this website. It may be offline, blocking automated requests, or misconfigured.',
    }
  }
  return { status: candidateStatus, failureSummary: null }
}

export async function processCrawlBatch(store: CrawlStore, crawlRunId: string, options?: ProcessCrawlBatchOptions): Promise<BatchOutcome> {
  const wallClockBudgetMs = options?.batchWallClockBudgetMs ?? BATCH_WALL_CLOCK_BUDGET_MS
  const crawlRun = await store.getCrawlRun(crawlRunId)
  if (!crawlRun) throw new Error('Crawl run not found.')

  if (TERMINAL_STATUSES.has(crawlRun.status)) {
    return { done: true, status: crawlRun.status, pagesProcessedThisInvocation: 0 }
  }

  let startedAt = crawlRun.started_at
  if (crawlRun.status === 'queued') {
    startedAt = new Date().toISOString()
    await store.updateCrawlRun(crawlRunId, { status: 'running', started_at: startedAt })
  }

  // Engine-hardening pass (2026-09-24): checked BEFORE claiming any work,
  // so a run that went stale while nothing was driving it (the browser tab
  // that was supposed to keep calling this function got closed) is
  // terminated the instant anything next touches it, instead of being
  // handed a fresh wall-clock budget and left running indefinitely. See
  // MAX_CRAWL_RUN_AGE_MINUTES's own doc comment.
  if (startedAt && isCrawlRunTimedOut({ started_at: startedAt, created_at: crawlRun.created_at })) {
    const counts = await store.recomputeCrawlRunCounts(crawlRunId)
    const { status, failureSummary } = resolveTerminalStatus('partial', counts)
    await store.updateCrawlRun(crawlRunId, {
      status,
      failure_summary: failureSummary ?? (status === 'partial' ? 'The scan took too long to finish and was stopped with the evidence collected so far.' : null),
      completed_at: new Date().toISOString(),
      pages_discovered: counts.pagesDiscovered,
      pages_processed: counts.pagesProcessed,
      pages_succeeded: counts.pagesSucceeded,
      pages_failed: counts.pagesFailed,
      pages_skipped: counts.pagesSkipped,
    })
    return { done: true, status, pagesProcessedThisInvocation: 0 }
  }

  try {
    // Phase 25B: fresh, authoritative counts — see CrawlStore.recomputeCrawlRunCounts'
    // own doc comment for why this replaces locally-accumulated counters.
    // Never trusts `crawlRun.pages_processed` itself for the budget check
    // below, since a concurrent invocation of this same function (a
    // double-clicked "Continue Scan", a retried request) may have already
    // advanced it since the `getCrawlRun` call above.
    let counts = await store.recomputeCrawlRunCounts(crawlRunId)

    const batchStartedAt = Date.now()
    let processedThisInvocation = 0
    let budgetReached = counts.pagesProcessed >= crawlRun.effective_page_budget
    let presumedUnreachable = isCrawlPresumedUnreachable(counts)
    let robotsRules: RobotsRules | null = null
    let robotsChecked = false

    while (!budgetReached && !presumedUnreachable && Date.now() - batchStartedAt < wallClockBudgetMs) {
      const remainingBudget = crawlRun.effective_page_budget - counts.pagesProcessed
      if (remainingBudget <= 0) {
        budgetReached = true
        break
      }

      const claimed = await store.claimPages(crawlRunId, Math.min(BATCH_SIZE, remainingBudget), STALE_CLAIM_MINUTES)
      if (claimed.length === 0) break

      if (!robotsChecked) {
        robotsChecked = true
        const urlParts = safeUrlParts(claimed[0].url)
        if (urlParts) {
          const robotsResult = await fetchRobotsRules(urlParts.origin)
          // fetchRobotsRules 'not_found'/'unreachable' both fail OPEN
          // (null rules = isPathAllowed treats everything as allowed) —
          // see fetchRobotsRules's own doc comment for why an unreachable
          // robots.txt must never itself block an entire crawl.
          robotsRules = robotsResult.ok ? robotsResult.rules : null
        }
      }

      for (const page of claimed) {
        try {
          await processOnePage(store, page, crawlRun.max_depth, robotsRules)
          processedThisInvocation++
        } catch (err) {
          // A persistence failure while processing ONE page must never look
          // like a silent success, but it also must not abort the entire
          // batch (see this function's own doc comment: "never throws for a
          // single bad page"). Left uncaught, a single transient write error
          // (e.g. a schema mismatch, a dropped connection) would previously
          // have been swallowed inside the store methods themselves with no
          // trace at all; now it is at minimum logged, and the page is left
          // in its claimed 'processing' state so claimPages' own stale-reclaim
          // picks it up again on a later invocation instead of it silently
          // vanishing from the frontier.
          console.error(`[crawler] processOnePage failed for page ${page.id} (${page.url}):`, err)
        }
      }

      counts = await store.recomputeCrawlRunCounts(crawlRunId)
      await store.updateCrawlRun(crawlRunId, {
        pages_discovered: counts.pagesDiscovered,
        pages_processed: counts.pagesProcessed,
        pages_succeeded: counts.pagesSucceeded,
        pages_failed: counts.pagesFailed,
        pages_skipped: counts.pagesSkipped,
      })

      budgetReached = counts.pagesProcessed >= crawlRun.effective_page_budget
      presumedUnreachable = isCrawlPresumedUnreachable(counts)
    }

    // Engine-hardening pass (2026-09-24): a presumed-unreachable site fails
    // fast, on its OWN dedicated path — never routed through the
    // budget/frontier logic below, since there is no point discovering
    // "nothing left to claim" or "budget exhausted" for a site that has
    // already shown it cannot be fetched at all.
    if (presumedUnreachable) {
      await store.skipRemainingQueuedPages(crawlRunId, UNREACHABLE_SKIP_REASON)
      const finalCounts = await store.recomputeCrawlRunCounts(crawlRunId)
      await store.updateCrawlRun(crawlRunId, {
        status: 'failed',
        failure_summary: 'webioom could not successfully fetch any page from this website. It may be offline, blocking automated requests, or misconfigured.',
        completed_at: new Date().toISOString(),
        pages_discovered: finalCounts.pagesDiscovered,
        pages_processed: finalCounts.pagesProcessed,
        pages_succeeded: finalCounts.pagesSucceeded,
        pages_failed: finalCounts.pagesFailed,
        pages_skipped: finalCounts.pagesSkipped,
      })
      return { done: true, status: 'failed', pagesProcessedThisInvocation: processedThisInvocation }
    }

    if (budgetReached) {
      const skippedCount = await store.skipRemainingQueuedPages(crawlRunId, BUDGET_SKIP_REASON)
      if (skippedCount > 0) counts = await store.recomputeCrawlRunCounts(crawlRunId)

      // Reaching the budget is only a genuine PARTIAL result if something was
      // actually left uncrawled because of it — either a still-queued page
      // skipRemainingQueuedPages just cut off, or a page some other
      // invocation still has claimed (`processing`) that this invocation is
      // now forbidden from reclaiming (the while loop's own remainingBudget
      // check above never lets it claim past the budget). When a site's
      // total discoverable pages lands exactly ON the budget with nothing
      // left in either state, the crawl covered everything there was —
      // that is a completion, not a partial one, even though the same
      // `pagesProcessed >= effective_page_budget` condition triggered this
      // branch either way.
      const stillHasUnprocessedWork = skippedCount > 0 || (await store.hasRemainingWork(crawlRunId, STALE_CLAIM_MINUTES))
      const { status: finalStatus, failureSummary } = resolveTerminalStatus(stillHasUnprocessedWork ? 'partial' : 'completed', counts)

      await store.updateCrawlRun(crawlRunId, {
        status: finalStatus,
        failure_summary: failureSummary,
        completed_at: new Date().toISOString(),
        pages_discovered: counts.pagesDiscovered,
        pages_processed: counts.pagesProcessed,
        pages_succeeded: counts.pagesSucceeded,
        pages_failed: counts.pagesFailed,
        pages_skipped: counts.pagesSkipped,
      })

      return { done: true, status: finalStatus, pagesProcessedThisInvocation: processedThisInvocation }
    }

    const stillHasWork = await store.hasRemainingWork(crawlRunId, STALE_CLAIM_MINUTES)

    if (!stillHasWork) {
      const { status: finalStatus, failureSummary } = resolveTerminalStatus('completed', counts)
      await store.updateCrawlRun(crawlRunId, { status: finalStatus, failure_summary: failureSummary, completed_at: new Date().toISOString() })
      return { done: true, status: finalStatus, pagesProcessedThisInvocation: processedThisInvocation }
    }

    return { done: false, status: 'running', pagesProcessedThisInvocation: processedThisInvocation }
  } catch (err) {
    // Engine-hardening pass (2026-09-24): anything unexpected thrown by the
    // store layer itself (not an individual page's fetch/parse — that is
    // already isolated above) must never leave the run silently stuck in
    // 'running'. Best-effort: if even THIS write fails, the original error
    // still propagates to the caller so it is at minimum surfaced there.
    console.error(`[crawler] processCrawlBatch failed unexpectedly for crawl run ${crawlRunId}:`, err)
    try {
      await store.updateCrawlRun(crawlRunId, {
        status: 'failed',
        failure_summary: 'The scan stopped due to an unexpected error.',
        completed_at: new Date().toISOString(),
      })
    } catch (persistErr) {
      console.error(`[crawler] failed to persist failure status for crawl run ${crawlRunId}:`, persistErr)
    }
    throw err
  }
}
