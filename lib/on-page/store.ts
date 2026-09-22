import type { OnPageFindingRow, OnPageFindingPageRow, AggregatedFinding, OnPageAnalysisRow } from './types'
import type { OnPageAnalysisCoverage } from './coverage'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

/**
 * Phase 28 — the analysis engine's ONLY view of persistence, mirroring
 * lib/architecture/store.ts's own ports-and-adapters seam exactly:
 * run-analysis.ts depends only on this interface, never on Supabase
 * directly, so its orchestration is testable against a fast in-memory fake
 * (tests/helpers/fake-on-page-store.ts) instead of a live Postgres instance.
 *
 * `CrawlAnalysisRow` is imported from lib/technical-seo/types — it is
 * crawl_analyses' own row shape, which On-Page SEO reuses AS-IS exactly
 * like Site Architecture does.
 */

export type SaveAnalysisInput = {
  crawlRunId: string
  websiteId: string
  analyzerVersion: string
  findings: AggregatedFinding[]
  healthScore: number
  /** Founder-reported bug (2026-09-22) — persisted alongside the analysis; see lib/on-page/coverage.ts. Optional so a caller that genuinely cannot compute it (e.g. an older test) is not forced to. */
  coverage?: OnPageAnalysisCoverage
}

export type FindingWithPages = OnPageFindingRow & { affectedPages: OnPageFindingPageRow[] }

export type OnPageStore = {
  /** Loads the crawl_run + every crawl_pages row for it. Null if the crawl_run does not exist. */
  getCrawlEvidence(crawlRunId: string): Promise<CrawlEvidence | null>

  /**
   * Upserts the (crawl_run_id, analyzer_version) crawl_analyses row and
   * REPLACES its on_page_findings wholesale with `input.findings` — the
   * mechanism that makes re-analysis idempotent without an ever-growing
   * history of stale rows.
   */
  saveAnalysis(input: SaveAnalysisInput): Promise<OnPageAnalysisRow>

  /** The most recent analysis for this (crawl_run, analyzer_version) pair, if one exists. */
  getLatestAnalysis(crawlRunId: string, analyzerVersion: string): Promise<OnPageAnalysisRow | null>

  /** Every finding for one analysis, each with its own affected-page evidence attached. */
  getFindingsWithPages(crawlAnalysisId: string): Promise<FindingWithPages[]>
}
