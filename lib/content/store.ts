import type { ContentFindingRow, ContentFindingPageRow, AggregatedFinding, ContentAnalysisRow } from './types'
import type { ContentAnalysisCoverage } from './coverage'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

/**
 * Phase 29 — the analysis engine's ONLY view of persistence, mirroring
 * lib/on-page/store.ts's own ports-and-adapters seam exactly.
 */

export type SaveAnalysisInput = {
  crawlRunId: string
  websiteId: string
  analyzerVersion: string
  findings: AggregatedFinding[]
  healthScore: number
  /** Phase 29 targeted completion pass — persisted alongside the analysis; see lib/content/coverage.ts. Optional so a caller that genuinely cannot compute it (e.g. a future test) is not forced to. */
  coverage?: ContentAnalysisCoverage
}

export type FindingWithPages = ContentFindingRow & { affectedPages: ContentFindingPageRow[] }

export type ContentStore = {
  /** Loads the crawl_run + every crawl_pages row for it. Null if the crawl_run does not exist. */
  getCrawlEvidence(crawlRunId: string): Promise<CrawlEvidence | null>

  /** Upserts the (crawl_run_id, analyzer_version) crawl_analyses row and REPLACES its content_findings wholesale with `input.findings`. */
  saveAnalysis(input: SaveAnalysisInput): Promise<ContentAnalysisRow>

  /** The most recent analysis for this (crawl_run, analyzer_version) pair, if one exists. */
  getLatestAnalysis(crawlRunId: string, analyzerVersion: string): Promise<ContentAnalysisRow | null>

  /** Every finding for one analysis, each with its own affected-page evidence attached. */
  getFindingsWithPages(crawlAnalysisId: string): Promise<FindingWithPages[]>
}
