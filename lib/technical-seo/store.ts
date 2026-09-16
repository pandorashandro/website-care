import type { CrawlAnalysisRow, TechnicalFindingRow, TechnicalFindingPageRow, AggregatedFinding } from './types'
import type { CrawlEvidence } from './evidence'

/**
 * Phase 26 — the analysis engine's ONLY view of persistence, mirroring
 * lib/crawler/store.ts's own ports-and-adapters seam exactly: run-analysis.ts
 * depends only on this interface, never on Supabase directly, so its
 * orchestration (evidence loading, analyzer execution, aggregation,
 * persistence) is testable against a fast in-memory fake
 * (tests/helpers/fake-technical-seo-store.ts) instead of a live Postgres
 * instance.
 */

export type SaveAnalysisInput = {
  crawlRunId: string
  websiteId: string
  analyzerVersion: string
  findings: AggregatedFinding[]
  /** Phase 26B — the ONE authoritative Technical SEO health score for this analysis, computed once by lib/technical-seo/health.ts and persisted here so every reader (Overview, the dedicated page) selects the same stored value instead of ever recomputing it. */
  healthScore: number
}

export type FindingWithPages = TechnicalFindingRow & { affectedPages: TechnicalFindingPageRow[] }

export type TechnicalSeoStore = {
  /** Loads the crawl_run + every crawl_pages/crawl_links row for it. Null if the crawl_run does not exist. */
  getCrawlEvidence(crawlRunId: string): Promise<CrawlEvidence | null>

  /**
   * Upserts the (crawl_run_id, analyzer_version) crawl_analyses row and
   * REPLACES its technical_findings wholesale with `input.findings` — the
   * mechanism that makes re-analysis idempotent (Checkpoint 9: "safe to
   * retry, no duplicate findings on repeated analysis") without an
   * ever-growing history of stale rows from earlier runs.
   */
  saveAnalysis(input: SaveAnalysisInput): Promise<CrawlAnalysisRow>

  /** The most recent analysis for this (crawl_run, analyzer_version) pair, if one exists. */
  getLatestAnalysis(crawlRunId: string, analyzerVersion: string): Promise<CrawlAnalysisRow | null>

  /** Every finding for one analysis, each with its own affected-page evidence attached. */
  getFindingsWithPages(crawlAnalysisId: string): Promise<FindingWithPages[]>
}
