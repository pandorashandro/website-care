import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CrawlStore, NewCrawlRunInput, NewCrawlPageInput, CrawlRunCounts } from './store'
import type { CrawlRunRow, CrawlPageRow, CrawlLinkInsert } from './types'
import { BUDGET_SKIP_REASON } from './limits'

/**
 * Phase 25A — the real, Supabase-backed CrawlStore. Uses the service-role
 * admin client throughout: crawl_runs/crawl_pages/crawl_links grant
 * `authenticated` SELECT only (see the migration) — every write happens
 * here, after the caller (lib/crawler/engine.ts's public entry points, via
 * app/dashboard/websites/[id]/crawl-actions.ts) has already independently
 * verified website ownership through the ordinary session-aware client,
 * exactly mirroring shopify-credentials.ts's own established pattern. This
 * module performs NO ownership check of its own — by design, matching
 * every other admin-client module in this codebase.
 */
export function createSupabaseCrawlStore(): CrawlStore {
  const admin = createAdminClient()

  return {
    async createCrawlRun(input: NewCrawlRunInput): Promise<CrawlRunRow> {
      const { data, error } = await admin
        .from('crawl_runs')
        .insert({
          website_id: input.websiteId,
          requested_page_budget: input.requestedPageBudget,
          effective_page_budget: input.effectivePageBudget,
          max_depth: input.maxDepth,
        })
        .select('*')
        .single()

      if (error || !data) throw new Error(`Could not create crawl run: ${error?.message ?? 'unknown error'}`)
      return data as CrawlRunRow
    },

    async findActiveCrawlRun(websiteId: string): Promise<CrawlRunRow | null> {
      const { data } = await admin
        .from('crawl_runs')
        .select('*')
        .eq('website_id', websiteId)
        .in('status', ['queued', 'running'])
        .maybeSingle()

      return (data as CrawlRunRow | null) ?? null
    },

    async getCrawlRun(id: string): Promise<CrawlRunRow | null> {
      const { data } = await admin.from('crawl_runs').select('*').eq('id', id).maybeSingle()
      return (data as CrawlRunRow | null) ?? null
    },

    async updateCrawlRun(id: string, patch): Promise<void> {
      await admin
        .from('crawl_runs')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
    },

    async claimPages(crawlRunId, batchSize, staleAfterMinutes): Promise<CrawlPageRow[]> {
      const { data, error } = await admin.rpc('claim_crawl_pages', {
        p_crawl_run_id: crawlRunId,
        p_batch_size: batchSize,
        p_stale_after_minutes: staleAfterMinutes,
      })

      if (error) throw new Error(`Could not claim crawl pages: ${error.message}`)
      return (data as CrawlPageRow[] | null) ?? []
    },

    async updatePage(id, patch): Promise<void> {
      await admin.from('crawl_pages').update(patch).eq('id', id)
    },

    async upsertQueuedPages(rows: NewCrawlPageInput[]): Promise<void> {
      if (rows.length === 0) return

      await admin
        .from('crawl_pages')
        .upsert(
          rows.map((row) => ({
            crawl_run_id: row.crawlRunId,
            website_id: row.websiteId,
            url: row.url,
            discovered_url: row.discoveredUrl,
            depth: row.depth,
            discovered_via: row.discoveredVia,
          })),
          { onConflict: 'crawl_run_id,url', ignoreDuplicates: true }
        )
    },

    async insertLinks(rows: CrawlLinkInsert[]): Promise<void> {
      if (rows.length === 0) return
      // ON CONFLICT DO NOTHING on (crawl_run_id, source_page_id, target_url)
      // — see the migration's own comment on crawl_links_run_source_target_unique
      // for why this is safe: a reclaimed/reprocessed page (see
      // claim_crawl_pages' stale-reclaim) would otherwise insert duplicate
      // edges for the same links.
      await admin.from('crawl_links').upsert(rows, { onConflict: 'crawl_run_id,source_page_id,target_url', ignoreDuplicates: true })
    },

    async hasRemainingWork(crawlRunId, staleAfterMinutes): Promise<boolean> {
      const staleThreshold = new Date(Date.now() - staleAfterMinutes * 60_000).toISOString()

      const { count } = await admin
        .from('crawl_pages')
        .select('id', { count: 'exact', head: true })
        .eq('crawl_run_id', crawlRunId)
        .or(`status.eq.queued,and(status.eq.processing,claimed_at.lt.${staleThreshold})`)

      return (count ?? 0) > 0
    },

    async skipRemainingQueuedPages(crawlRunId, reason): Promise<number> {
      const { data, error } = await admin
        .from('crawl_pages')
        .update({ status: 'skipped', error_reason: reason })
        .eq('crawl_run_id', crawlRunId)
        .eq('status', 'queued')
        .select('id')

      if (error) throw new Error(`Could not skip remaining queued pages: ${error.message}`)
      return data?.length ?? 0
    },

    async recomputeCrawlRunCounts(crawlRunId): Promise<CrawlRunCounts> {
      // Independent head-count queries rather than one GROUP BY
      // (PostgREST's fluent query builder has no aggregate/group support
      // without a bespoke RPC function, and a handful of small count-only
      // queries against an indexed (crawl_run_id, status) column — see the
      // migration's crawl_pages_run_status_depth index — are fast enough
      // not to justify one). `head: true` means Postgres never actually
      // returns row bodies, only the count.
      const [total, succeeded, failed, skippedTotal, skippedByBudget] = await Promise.all([
        admin.from('crawl_pages').select('id', { count: 'exact', head: true }).eq('crawl_run_id', crawlRunId).then((r) => r.count ?? 0),
        admin.from('crawl_pages').select('id', { count: 'exact', head: true }).eq('crawl_run_id', crawlRunId).eq('status', 'completed').then((r) => r.count ?? 0),
        admin.from('crawl_pages').select('id', { count: 'exact', head: true }).eq('crawl_run_id', crawlRunId).eq('status', 'failed').then((r) => r.count ?? 0),
        admin.from('crawl_pages').select('id', { count: 'exact', head: true }).eq('crawl_run_id', crawlRunId).eq('status', 'skipped').then((r) => r.count ?? 0),
        // See BUDGET_SKIP_REASON's own doc comment: a budget-exhausted
        // skip means this page was never actually claimed/attempted, so it
        // must NOT count toward pagesProcessed — only a robots-disallowed
        // skip (a page that WAS claimed and evaluated) does. Both count
        // toward the user-facing pagesSkipped total either way.
        admin
          .from('crawl_pages')
          .select('id', { count: 'exact', head: true })
          .eq('crawl_run_id', crawlRunId)
          .eq('status', 'skipped')
          .eq('error_reason', BUDGET_SKIP_REASON)
          .then((r) => r.count ?? 0),
      ])

      const attemptedSkipped = skippedTotal - skippedByBudget

      return {
        pagesDiscovered: total,
        pagesProcessed: succeeded + failed + attemptedSkipped,
        pagesSucceeded: succeeded,
        pagesFailed: failed,
        pagesSkipped: skippedTotal,
      }
    },
  }
}
