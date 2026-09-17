import type { CrawlPageRow } from '@/lib/crawler/types'

/**
 * Phase 28 — precomputed, shared context every On-Page check receives,
 * mirroring lib/architecture/context.ts's own AnalyzerContext pattern.
 * Simpler than Site Architecture's own context: On-Page SEO has no link
 * graph concept, so there is no `graph` field here.
 */
export type AnalyzerContext = {
  /** Pages eligible under lib/on-page/eligibility.ts's isOnPageEligiblePage — the population every On-Page check evaluates. */
  eligiblePages: CrawlPageRow[]
  /** Every page this analysis actually evaluated (crawl_pages.status === 'completed') — the denominator health.ts's spread calculation uses, mirroring every other category engine's own totalAnalyzedPages. */
  totalAnalyzedPages: number
  /**
   * True when the underlying crawl_run.status is 'partial'. Unlike Site
   * Architecture, NO On-Page V1 check is suppressed on a partial crawl —
   * every current check (missing/duplicate/too-short/too-long title or meta
   * description, missing/multiple H1) is valid evidence about the pages
   * actually analyzed, even if other pages remain unanalyzed (see
   * docs/on-page-seo-engine.md's "Partial crawl behavior" section for the
   * per-check reasoning). This flag exists so findings' own wording can
   * stay honest about scope ("within the pages analyzed" rather than
   * "your site") without needing to suppress anything.
   */
  isPartialCrawl: boolean
}
