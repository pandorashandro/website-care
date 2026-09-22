import type { ArchitectureFindingRow, ArchitectureFindingPageRow, AggregatedFinding, ArchitectureAnalysisRow } from './types'
import type { ArchitectureCoverage } from './coverage'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

/**
 * Phase 27 — the analysis engine's ONLY view of persistence, mirroring
 * lib/technical-seo/store.ts's own ports-and-adapters seam exactly:
 * run-analysis.ts depends only on this interface, never on Supabase
 * directly, so its orchestration is testable against a fast in-memory fake
 * (tests/helpers/fake-architecture-store.ts) instead of a live Postgres
 * instance.
 *
 * `CrawlAnalysisRow` is imported from lib/technical-seo/types — it is
 * crawl_analyses' own row shape, which Site Architecture reuses AS-IS (see
 * the migration's own comment for why no schema change was needed there).
 * This is a legitimate cross-engine import of a genuinely shared,
 * category-agnostic row type, not a dependency on Technical SEO's own
 * logic.
 */

export type SaveAnalysisInput = {
  crawlRunId: string
  websiteId: string
  analyzerVersion: string
  findings: AggregatedFinding[]
  healthScore: number
  /** Evidence-aware health scoring (2026-09-22) — persisted alongside the analysis; see lib/architecture/coverage.ts. Optional so a caller that genuinely cannot compute it (e.g. an older test) is not forced to. */
  coverage?: ArchitectureCoverage
}

export type FindingWithPages = ArchitectureFindingRow & { affectedPages: ArchitectureFindingPageRow[] }

export type ArchitectureStore = {
  /** Loads the crawl_run + every crawl_pages/crawl_links row for it. Null if the crawl_run does not exist. */
  getCrawlEvidence(crawlRunId: string): Promise<CrawlEvidence | null>

  /**
   * Upserts the (crawl_run_id, analyzer_version) crawl_analyses row and
   * REPLACES its architecture_findings wholesale with `input.findings` —
   * the mechanism that makes re-analysis idempotent without an
   * ever-growing history of stale rows.
   */
  saveAnalysis(input: SaveAnalysisInput): Promise<ArchitectureAnalysisRow>

  /** The most recent analysis for this (crawl_run, analyzer_version) pair, if one exists. */
  getLatestAnalysis(crawlRunId: string, analyzerVersion: string): Promise<ArchitectureAnalysisRow | null>

  /** Every finding for one analysis, each with its own affected-page evidence attached. */
  getFindingsWithPages(crawlAnalysisId: string): Promise<FindingWithPages[]>
}
