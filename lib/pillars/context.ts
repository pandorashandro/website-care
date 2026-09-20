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
}
