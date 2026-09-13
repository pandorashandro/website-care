import type { CrawlRunRow, CrawlPageRow, CrawlLinkInsert, DiscoverySource } from './types'

/**
 * Phase 25A — the engine's ONLY view of persistence. `lib/crawler/engine.ts`
 * depends only on this interface, never on Supabase directly, specifically
 * so the engine's orchestration logic (claiming, batching, discovery,
 * finalization, resumability) can be exercised in tests against a fast
 * in-memory fake (tests/helpers/fake-crawl-store.ts) instead of a live
 * Postgres instance — this repository's migrations are never applied
 * automatically (see every prior migration's own "NOT YET APPLIED" note),
 * so there is no live `crawl_runs`/`crawl_pages` schema to test against
 * directly in this environment regardless.
 *
 * `lib/crawler/supabase-store.ts` is the real implementation, used in
 * production. It is intentionally thin (a near-literal translation of each
 * method into one Supabase call) so correctness is reviewable by
 * inspection rather than needing its own elaborate test double.
 */

export type NewCrawlRunInput = {
  websiteId: string
  requestedPageBudget: number
  effectivePageBudget: number
  maxDepth: number
}

export type NewCrawlPageInput = {
  crawlRunId: string
  websiteId: string
  url: string
  discoveredUrl: string | null
  depth: number
  discoveredVia: DiscoverySource
}

export type CrawlRunCounts = {
  pagesDiscovered: number
  pagesProcessed: number
  pagesSucceeded: number
  pagesFailed: number
  pagesSkipped: number
}

export type CrawlStore = {
  createCrawlRun(input: NewCrawlRunInput): Promise<CrawlRunRow>
  /** The at-most-one-active-crawl-per-website invariant — see the migration's partial unique index, which is this method's ultimate source of truth in production; the fake store enforces the same rule in memory for tests. */
  findActiveCrawlRun(websiteId: string): Promise<CrawlRunRow | null>
  getCrawlRun(id: string): Promise<CrawlRunRow | null>
  updateCrawlRun(id: string, patch: Partial<CrawlRunRow>): Promise<void>

  /** Atomic, concurrency-safe claim of up to `batchSize` queued (or stale-processing) pages — see claim_crawl_pages in the migration. */
  claimPages(crawlRunId: string, batchSize: number, staleAfterMinutes: number): Promise<CrawlPageRow[]>
  updatePage(id: string, patch: Partial<CrawlPageRow>): Promise<void>
  /** Insert-if-absent by (crawlRunId, url) — duplicate-safe by construction, never throws on a URL already queued/processed in this run. */
  upsertQueuedPages(rows: NewCrawlPageInput[]): Promise<void>
  insertLinks(rows: CrawlLinkInsert[]): Promise<void>

  /** True if any page for this run is still queued, or processing-but-stale (i.e. there is more work an invocation could still claim). */
  hasRemainingWork(crawlRunId: string, staleAfterMinutes: number): Promise<boolean>
  /** Marks every still-queued page 'skipped' (budget exhausted) and returns how many were changed. */
  skipRemainingQueuedPages(crawlRunId: string, reason: string): Promise<number>

  /**
   * Phase 25B: recomputes crawl_runs' cached progress counters FRESH from
   * crawl_pages' own row statuses, rather than the engine maintaining a
   * running total itself. This exists specifically to close a real
   * lost-update race: two overlapping invocations of processCrawlBatch for
   * the SAME crawl_run_id (a double-clicked "Continue Scan", a retried
   * request — claimPages' SKIP LOCKED already makes such overlap safe with
   * respect to which PAGES get processed, but says nothing about the
   * run-level counters) would otherwise both read the same starting
   * counter value, each add their own delta, and whichever writes last
   * would silently erase the other's progress. Counting crawl_pages
   * directly is a pure read with no read-modify-write window at all, so
   * it is correct regardless of how many invocations run concurrently.
   */
  recomputeCrawlRunCounts(crawlRunId: string): Promise<CrawlRunCounts>
}
