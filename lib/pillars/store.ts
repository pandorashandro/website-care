import type { PillarKey, PillarFindingRow, PillarFindingPageRow, AggregatedFinding, PillarAnalysisRow } from './types'
import type { PillarCoverage } from './coverage'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

/**
 * Unified webioom engine, Prompt 2 — the ONE store interface shared by
 * Performance/Accessibility/Security, mirroring lib/content/store.ts's own
 * ports-and-adapters seam exactly, but parameterized by `pillar` since all
 * three share the `pillar_findings`/`pillar_finding_pages` tables (see that
 * migration's own header comment).
 */
export type SaveAnalysisInput = {
  pillar: PillarKey
  crawlRunId: string
  websiteId: string
  analyzerVersion: string
  findings: AggregatedFinding[]
  healthScore: number
  /** Evidence-aware health scoring (2026-09-22) — persisted alongside the analysis; see lib/pillars/coverage.ts. Optional so a caller that genuinely cannot compute it (e.g. an older test) is not forced to. */
  coverage?: PillarCoverage
}

export type FindingWithPages = PillarFindingRow & { affectedPages: PillarFindingPageRow[] }

export type PillarStore = {
  getCrawlEvidence(crawlRunId: string): Promise<CrawlEvidence | null>
  saveAnalysis(input: SaveAnalysisInput): Promise<PillarAnalysisRow>
  getLatestAnalysis(crawlRunId: string, analyzerVersion: string): Promise<PillarAnalysisRow | null>
  getFindingsWithPages(crawlAnalysisId: string): Promise<FindingWithPages[]>
}
