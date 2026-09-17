/**
 * Phase 25A — shared crawler vocabulary. Types only, mirroring
 * lib/integrations/platform.ts's own "types first, no premature
 * abstraction" convention. These names track the migration's CHECK
 * constraints exactly (supabase/migrations/20260920000000_crawl_foundation.sql)
 * — if either drifts, update both together.
 */

export type CrawlRunStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled'

export type CrawlPageStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'skipped'

export type DiscoverySource = 'seed' | 'link' | 'sitemap'

export type LinkType = 'internal' | 'external'

export type CrawlRunRow = {
  id: string
  website_id: string
  status: CrawlRunStatus
  requested_page_budget: number
  effective_page_budget: number
  max_depth: number
  pages_discovered: number
  pages_processed: number
  pages_succeeded: number
  pages_failed: number
  pages_skipped: number
  failure_summary: string | null
  crawler_version: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  updated_at: string
  /** Phase 26 — outcome of the one robots.txt fetch startCrawlRun already performs. Null for a crawl_run created before this column existed. */
  robots_status: 'ok' | 'not_found' | 'unreachable' | null
  /** Phase 26 — outcome of the sitemap discovery pass startCrawlRun already performs. Null for a crawl_run created before this column existed. */
  sitemap_status: 'ok' | 'unreachable' | 'empty' | null
  /** Phase 26 — total URLs collected across all sitemap files, before budget slicing. Null for a crawl_run created before this column existed. */
  sitemap_url_count: number | null
}

export type CrawlPageRow = {
  id: string
  crawl_run_id: string
  website_id: string
  url: string
  discovered_url: string | null
  final_url: string | null
  depth: number
  discovered_via: DiscoverySource
  status: CrawlPageStatus
  claimed_at: string | null
  http_status: number | null
  content_type: string | null
  canonical_url: string | null
  robots_allowed: boolean | null
  noindex: boolean | null
  title: string | null
  meta_description: string | null
  h1_text: string | null
  response_time_ms: number | null
  response_size_bytes: number | null
  error_reason: string | null
  discovered_at: string
  fetched_at: string | null
  /** Phase 26 — redirect hops fetchPage followed before reaching final_url/http_status. 0 when fetched directly with no redirect. */
  redirect_count: number
  /** Phase 26B — true if this page contained at least one JSON-LD structured data block. */
  structured_data_present: boolean
  /** Phase 26B — true if every JSON-LD block parsed as valid JSON; false if at least one didn't; null when none were present. Syntax validity only, never schema.org semantic validation. */
  structured_data_valid: boolean | null
  /** Phase 26B — a short description of the first JSON parse failure, when structured_data_valid is false. */
  structured_data_error: string | null
  /** Phase 26B — every {lang, href} extracted from this page's <link rel="alternate" hreflang="..."> tags. Empty array (the common case) means none were found. */
  hreflang_tags: Array<{ lang: string; href: string }>
  /** Phase 28 — total count of <h1> elements on this page (0 if none). Independent of h1_text, which only ever stores the FIRST one's text — see lib/on-page/checks/headings.ts's multiple_h1 check, which is the reason this was added. */
  h1_count: number
}

export type CrawlLinkInsert = {
  crawl_run_id: string
  source_page_id: string
  target_url: string
  target_page_id: string | null
  link_type: LinkType
  anchor_text: string | null
}

/** Phase 26 — the full read shape of a crawl_links row, for analyzers that read back the discovered site graph (lib/crawler/engine.ts itself never reads this back — it only ever inserts). */
export type CrawlLinkRow = CrawlLinkInsert & {
  id: string
  discovered_at: string
}

/** A candidate URL discovered during processing, before it becomes a crawl_pages row. */
export type DiscoveredUrl = {
  url: string
  depth: number
  discoveredVia: DiscoverySource
}
