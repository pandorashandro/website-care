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
  /** Phase 29 — cleaned substantive body text extracted from block-level containers (see lib/crawler/content-extract.ts/getSubstantiveBlocks — broader than `<p>`-only since Phase 29's real-world evidence-quality pass), blocks joined by "\n\n", bounded to CONTENT_TEXT_MAX_CHARS. A PREFIX only on a long page -- content_word_count/content_paragraph_count below are computed from the FULL page, not this truncated sample. Null for non-HTML pages or pages with no extractable substantive text. */
  content_text: string | null
  /** Phase 29 — total word count of the FULL substantive block text (untruncated), the basis for thin-content detection. */
  content_word_count: number
  /** Phase 29 — total count of substantive blocks (>= MIN_BLOCK_WORDS words each) on the FULL page (untruncated). */
  content_paragraph_count: number
  /** Phase 29 — up to CONTENT_MAX_HEADINGS <h2> section-heading texts, each truncated to CONTENT_HEADING_MAX_CHARS -- a weak structural signal only, never proof a specific section is present/absent. */
  content_heading_texts: string[]
  /** Phase 29 — a sha256 hex fingerprint of the FULL (untruncated) normalized substantive text, used for O(1) exact-duplicate-content grouping across pages. Null when there is no extractable text (nothing meaningful to fingerprint) -- see lib/content/checks/exact-duplicate.ts for why near-empty pages are excluded from duplicate grouping entirely. */
  content_hash: string | null
  /** Phase 29 real-world evidence-quality pass — 'low' when this page's raw visible text (every visible character, chrome included) is clearly non-trivial but almost none of it landed in a substantive content block, meaning the block extraction likely missed this page's real content structure. 'low' must never be read as "0 substantive words proves the page is empty" -- see lib/crawler/content-extract.ts's own doc comment and lib/content/eligibility.ts's getExtractionConfidence for how this softens dependent findings' confidence. */
  content_extraction_confidence: 'high' | 'low'
  /** Unified webioom engine, Prompt 2 — see lib/crawler/pillar-extract.ts's PerformanceEvidence for the exact shape. `{}` for a non-HTML/failed page. */
  performance_evidence: Record<string, unknown>
  /** Unified webioom engine, Prompt 2 — see lib/crawler/pillar-extract.ts's AccessibilityEvidence for the exact shape. `{}` for a non-HTML/failed page. */
  accessibility_evidence: Record<string, unknown>
  /** Unified webioom engine, Prompt 2 — see lib/crawler/pillar-extract.ts's SecurityEvidence for the exact shape. `{}` for a non-HTML/failed page (note: even then, isHttps is still a real, derivable fact -- see emptySecurityEvidence). */
  security_evidence: Record<string, unknown>
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
