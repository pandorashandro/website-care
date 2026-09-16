import type { CrawlPageRow } from '@/lib/crawler/types'

/**
 * Precomputed, shared lookups every analyzer receives alongside CrawlEvidence
 * — built once in run-analysis.ts rather than once per analyzer, so a
 * lookup like "which crawl_pages row does this canonical/link target point
 * to" never becomes an O(analyzers x pages^2) scan.
 */
export type AnalyzerContext = {
  /** crawl_pages row lookup by exact `url` within this crawl_run. */
  pageIndex: Map<string, CrawlPageRow>
  /** Distinct-source-page inbound link count by target_url. */
  inboundLinkCounts: Map<string, number>
  /** Total pages this analysis actually evaluated (completed pages) — the denominator severity.ts's spread calculation uses. */
  totalAnalyzedPages: number
}
