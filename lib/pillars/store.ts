import type { CrawlAnalysisRow } from '@/lib/technical-seo/types'
import type { PillarKey, PillarFindingRow, PillarFindingPageRow, AggregatedFinding } from './types'
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
}

export type FindingWithPages = PillarFindingRow & { affectedPages: PillarFindingPageRow[] }

export type PillarStore = {
  getCrawlEvidence(crawlRunId: string): Promise<CrawlEvidence | null>
  saveAnalysis(input: SaveAnalysisInput): Promise<CrawlAnalysisRow>
  getLatestAnalysis(crawlRunId: string, analyzerVersion: string): Promise<CrawlAnalysisRow | null>
  getFindingsWithPages(crawlAnalysisId: string): Promise<FindingWithPages[]>
}
