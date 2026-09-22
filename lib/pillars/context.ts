import type { CrawlPageRow } from '@/lib/crawler/types'

/**
 * Unified webioom engine, Prompt 2 — shared analyzer context for
 * Performance/Accessibility/Security, mirroring lib/on-page/context.ts's
 * own AnalyzerContext shape (no page-type classification needed, unlike
 * Content — none of these three checks' thresholds vary by page purpose).
 */
export type PillarAnalyzerContext = {
  eligiblePages: CrawlPageRow[]
  totalAnalyzedPages: number
  isPartialCrawl: boolean
  /**
   * Evidence-aware health scoring (2026-09-22) — every completed page
   * fetch, REGARDLESS of eligibility (2xx/noindex/self-canonical). Exists
   * specifically for the rare check whose fact survives a blocked/non-2xx
   * response — e.g. Security's `analyzeNotUsingHttps`: whether a page was
   * requested over HTTP or HTTPS is derivable from the URL/response alone,
   * even when the response itself was a 403 block page (see
   * lib/crawler/pillar-extract.ts's own emptySecurityEvidence, which
   * already computes `isHttps` for exactly this reason). Every OTHER
   * pillar check still correctly reads `eligiblePages` — this is a
   * narrowly-scoped exception, not a general relaxation of eligibility.
   */
  allCompletedPages: CrawlPageRow[]
}
