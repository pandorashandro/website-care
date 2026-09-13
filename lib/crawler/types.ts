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
}

export type CrawlLinkInsert = {
  crawl_run_id: string
  source_page_id: string
  target_url: string
  target_page_id: string | null
  link_type: LinkType
  anchor_text: string | null
}

/** A candidate URL discovered during processing, before it becomes a crawl_pages row. */
export type DiscoveredUrl = {
  url: string
  depth: number
  discoveredVia: DiscoverySource
}
