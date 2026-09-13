import { randomUUID } from 'node:crypto'
import type { CrawlStore, NewCrawlRunInput, NewCrawlPageInput } from '@/lib/crawler/store'
import type { CrawlRunRow, CrawlPageRow, CrawlLinkInsert } from '@/lib/crawler/types'
import { BUDGET_SKIP_REASON } from '@/lib/crawler/limits'

/**
 * Phase 25A — an in-memory CrawlStore used only by tests. Mirrors the real
 * Supabase-backed store's observable behavior (including the
 * (crawl_run_id, url) duplicate-prevention semantics and the
 * stale-processing-reclaim rule claim_crawl_pages implements via SQL)
 * closely enough to exercise lib/crawler/engine.ts's orchestration logic
 * meaningfully, WITHOUT proving Postgres-level concurrency guarantees
 * (FOR UPDATE SKIP LOCKED) — that guarantee is inherent to the SQL
 * function itself (supabase/migrations/20260920000000_crawl_foundation.sql),
 * reviewable by inspection, and not something a single-threaded in-memory
 * fake could meaningfully prove either way.
 */
export function createFakeCrawlStore(): CrawlStore & { _pages: CrawlPageRow[]; _runs: CrawlRunRow[]; _links: CrawlLinkInsert[] } {
  const runs: CrawlRunRow[] = []
  const pages: CrawlPageRow[] = []
  const links: CrawlLinkInsert[] = []

  function isStale(page: CrawlPageRow, staleAfterMinutes: number): boolean {
    if (page.status !== 'processing' || !page.claimed_at) return false
    return Date.now() - new Date(page.claimed_at).getTime() > staleAfterMinutes * 60_000
  }

  const store: CrawlStore & { _pages: CrawlPageRow[]; _runs: CrawlRunRow[]; _links: CrawlLinkInsert[] } = {
    _pages: pages,
    _runs: runs,
    _links: links,

    async createCrawlRun(input: NewCrawlRunInput): Promise<CrawlRunRow> {
      const now = new Date().toISOString()
      const run: CrawlRunRow = {
        id: randomUUID(),
        website_id: input.websiteId,
        status: 'queued',
        requested_page_budget: input.requestedPageBudget,
        effective_page_budget: input.effectivePageBudget,
        max_depth: input.maxDepth,
        pages_discovered: 0,
        pages_processed: 0,
        pages_succeeded: 0,
        pages_failed: 0,
        pages_skipped: 0,
        failure_summary: null,
        crawler_version: 'v1',
        created_at: now,
        started_at: null,
        completed_at: null,
        updated_at: now,
      }
      runs.push(run)
      return { ...run }
    },

    async findActiveCrawlRun(websiteId) {
      const found = runs.find((r) => r.website_id === websiteId && (r.status === 'queued' || r.status === 'running'))
      return found ? { ...found } : null
    },

    async getCrawlRun(id) {
      const found = runs.find((r) => r.id === id)
      return found ? { ...found } : null
    },

    async updateCrawlRun(id, patch) {
      const run = runs.find((r) => r.id === id)
      if (!run) return
      Object.assign(run, patch, { updated_at: new Date().toISOString() })
    },

    async claimPages(crawlRunId, batchSize, staleAfterMinutes) {
      const claimable = pages
        .filter((p) => p.crawl_run_id === crawlRunId && (p.status === 'queued' || isStale(p, staleAfterMinutes)))
        .sort((a, b) => a.depth - b.depth || new Date(a.discovered_at).getTime() - new Date(b.discovered_at).getTime())
        .slice(0, batchSize)

      const now = new Date().toISOString()
      for (const page of claimable) {
        page.status = 'processing'
        page.claimed_at = now
      }

      return claimable.map((p) => ({ ...p }))
    },

    async updatePage(id, patch) {
      const page = pages.find((p) => p.id === id)
      if (!page) return
      Object.assign(page, patch)
    },

    async upsertQueuedPages(rows: NewCrawlPageInput[]) {
      for (const row of rows) {
        const exists = pages.some((p) => p.crawl_run_id === row.crawlRunId && p.url === row.url)
        if (exists) continue

        pages.push({
          id: randomUUID(),
          crawl_run_id: row.crawlRunId,
          website_id: row.websiteId,
          url: row.url,
          discovered_url: row.discoveredUrl,
          final_url: null,
          depth: row.depth,
          discovered_via: row.discoveredVia,
          status: 'queued',
          claimed_at: null,
          http_status: null,
          content_type: null,
          canonical_url: null,
          robots_allowed: null,
          noindex: null,
          title: null,
          meta_description: null,
          h1_text: null,
          response_time_ms: null,
          response_size_bytes: null,
          error_reason: null,
          discovered_at: new Date().toISOString(),
          fetched_at: null,
        })
      }
    },

    async insertLinks(rows: CrawlLinkInsert[]) {
      // Mirrors the real store's ON CONFLICT DO NOTHING on
      // (crawl_run_id, source_page_id, target_url) — see the migration's
      // crawl_links_run_source_target_unique constraint.
      for (const row of rows) {
        const exists = links.some(
          (l) => l.crawl_run_id === row.crawl_run_id && l.source_page_id === row.source_page_id && l.target_url === row.target_url
        )
        if (!exists) links.push(row)
      }
    },

    async hasRemainingWork(crawlRunId, staleAfterMinutes) {
      return pages.some((p) => p.crawl_run_id === crawlRunId && (p.status === 'queued' || isStale(p, staleAfterMinutes)))
    },

    async skipRemainingQueuedPages(crawlRunId, reason) {
      const toSkip = pages.filter((p) => p.crawl_run_id === crawlRunId && p.status === 'queued')
      for (const page of toSkip) {
        page.status = 'skipped'
        page.error_reason = reason
      }
      return toSkip.length
    },

    async recomputeCrawlRunCounts(crawlRunId) {
      const runPages = pages.filter((p) => p.crawl_run_id === crawlRunId)
      const succeeded = runPages.filter((p) => p.status === 'completed').length
      const failed = runPages.filter((p) => p.status === 'failed').length
      const skippedTotal = runPages.filter((p) => p.status === 'skipped').length
      // See BUDGET_SKIP_REASON's own doc comment: a budget-exhausted skip
      // was never actually claimed/attempted, so it must not count toward
      // pagesProcessed — mirrors supabase-store.ts's real implementation.
      const skippedByBudget = runPages.filter((p) => p.status === 'skipped' && p.error_reason === BUDGET_SKIP_REASON).length
      const attemptedSkipped = skippedTotal - skippedByBudget

      return {
        pagesDiscovered: runPages.length,
        pagesProcessed: succeeded + failed + attemptedSkipped,
        pagesSucceeded: succeeded,
        pagesFailed: failed,
        pagesSkipped: skippedTotal,
      }
    },
  }

  return store
}
