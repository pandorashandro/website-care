import type { CrawlPageRow } from '@/lib/crawler/types'
import type { PageTypeResult } from './page-purpose'
import type { ExtractionConfidence } from './eligibility'

/**
 * Phase 29 — precomputed, shared context every Content check receives,
 * mirroring lib/on-page/context.ts's own AnalyzerContext pattern. No link
 * graph (Content Intelligence has no page-to-page relationship concept —
 * that is Site Architecture's own domain); `isHomepage` is a simple
 * `depth === 0` structural fact, not a guess.
 */
export type PageContext = {
  page: CrawlPageRow
  pageType: PageTypeResult
  extractionConfidence: ExtractionConfidence
  /**
   * Prompt 3 — see lib/category-engine/eligibility.ts's
   * hasLikelyAuxiliaryUrlSignal for the full reasoning. A generic,
   * evidence-based signal (link-discovered + query string) that a page is
   * more likely a parameterized/auxiliary variant than a deliberately
   * authored destination — never used to exclude a page, only to let
   * duplicate/repetition-style checks report reduced confidence when their
   * evidence leans heavily on such pages.
   */
  hasAuxiliaryUrlSignal: boolean
}

export type AnalyzerContext = {
  /** Eligible pages (lib/content/eligibility.ts's isContentEligiblePage), each paired with its classified page type and extraction confidence — computed once, shared across every check. */
  eligiblePages: PageContext[]
  /** Every page this analysis actually evaluated (crawl_pages.status === 'completed') — the denominator health.ts's spread calculation uses, mirroring every other category engine's own totalAnalyzedPages. */
  totalAnalyzedPages: number
  /**
   * True when the underlying crawl_run.status is 'partial'. No Content V1
   * check is suppressed on a partial crawl — every current check is either
   * page-local, or (for exact_duplicate_content/highly_repetitive_page)
   * describes only OBSERVED evidence within the analyzed scope, never a
   * claim of site-wide completeness. See
   * docs/content-intelligence-engine.md's "Partial crawl behavior" section.
   */
  isPartialCrawl: boolean
}
