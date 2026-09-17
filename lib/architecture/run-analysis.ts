import type { ArchitectureStore } from './store'
import { buildPageGraph } from './graph'
import type { AnalyzerContext } from './context'
import { completedPages, type CrawlEvidence } from '@/lib/crawler/evidence'
import { analyzeOrphanPages } from './checks/orphan'
import { analyzeDeepPages } from './checks/deep-pages'
import { analyzeUnderlinkedPages } from './checks/underlinked'
import { analyzeRedirectEdges } from './checks/redirect-edges'
import { analyzeBrokenEdges } from './checks/broken-edges'
import { analyzeDeadEnds } from './checks/dead-ends'
import { analyzeSiteWideConsistency } from './checks/site-wide'
import { analyzeLinkOpportunities } from './link-opportunities'
import { aggregateFindings } from './aggregate'
import { calculateArchitectureHealth, type ArchitectureHealth } from './health'
import { ANALYZER_VERSION } from './types'
import type { RawFinding, AggregatedFinding } from './types'
import type { CrawlAnalysisRow } from '@/lib/technical-seo/types'

/**
 * Phase 27 — the Site Architecture analysis engine's orchestration entry
 * point, mirroring lib/technical-seo/run-analysis.ts's proven pipeline
 * exactly:
 *
 *   crawl evidence -> page graph -> architecture checks -> structured
 *   findings -> aggregation/deduplication -> severity/confidence ->
 *   persisted findings
 *
 * Same execution model as Technical SEO: pure, read-only computation over
 * ALREADY-fetched crawl evidence, no network calls, no batching/
 * resumability needed — one call analyzes an entire crawl_run in one pass.
 */

export type AnalyzeArchitectureResult =
  | { ok: true; analysis: CrawlAnalysisRow; findings: AggregatedFinding[]; health: ArchitectureHealth }
  | { ok: false; error: string }

const ANALYZABLE_CRAWL_STATUSES = new Set(['completed', 'partial'])

type Analyzer = (evidence: CrawlEvidence, context: AnalyzerContext) => RawFinding[]

const ANALYZERS: Analyzer[] = [
  (evidence, context) => analyzeOrphanPages(evidence, context),
  (evidence) => analyzeDeepPages(evidence),
  (evidence, context) => analyzeUnderlinkedPages(evidence, context),
  (evidence, context) => analyzeRedirectEdges(evidence, context),
  (evidence, context) => analyzeBrokenEdges(evidence, context),
  (evidence, context) => analyzeDeadEnds(evidence, context),
  (evidence, context) => analyzeSiteWideConsistency(evidence, context),
  () => analyzeLinkOpportunities(),
]

/**
 * Runs every architecture analyzer over `crawlRunId`'s persisted evidence
 * and saves the result. Deterministic, idempotent (store.saveAnalysis
 * replaces the prior (crawl_run_id, analyzer_version) result wholesale),
 * and per-analyzer isolated (one analyzer throwing is caught and skipped
 * individually) — identical guarantees to Technical SEO's own engine, for
 * identical reasons.
 */
export async function analyzeArchitecture(store: ArchitectureStore, crawlRunId: string): Promise<AnalyzeArchitectureResult> {
  const evidence = await store.getCrawlEvidence(crawlRunId)
  if (!evidence) return { ok: false, error: 'Crawl not found.' }

  if (!ANALYZABLE_CRAWL_STATUSES.has(evidence.crawlRun.status)) {
    return { ok: false, error: 'This crawl has not finished yet — analysis requires a completed or partial crawl.' }
  }

  const context: AnalyzerContext = {
    graph: buildPageGraph(evidence),
    totalAnalyzedPages: completedPages(evidence).length,
    isPartialCrawl: evidence.crawlRun.status === 'partial',
  }

  const rawFindings: RawFinding[] = []
  for (const analyzer of ANALYZERS) {
    try {
      rawFindings.push(...analyzer(evidence, context))
    } catch {
      // Isolation: a broken analyzer is skipped, never allowed to discard
      // findings the other analyzers already produced.
    }
  }

  const aggregated = aggregateFindings(rawFindings, context.totalAnalyzedPages)
  const health = calculateArchitectureHealth(
    aggregated.map((finding) => ({
      checkKey: finding.checkKey,
      severity: finding.severity,
      confidence: finding.confidence,
      scope: finding.scope,
      affectedPageCount: finding.affectedPageCount,
      occurrenceCount: finding.occurrenceCount,
      uniqueTargetCount: finding.uniqueTargetCount,
    })),
    context.totalAnalyzedPages
  )

  const analysis = await store.saveAnalysis({
    crawlRunId,
    websiteId: evidence.crawlRun.website_id,
    analyzerVersion: ANALYZER_VERSION,
    findings: aggregated,
    healthScore: health.score,
  })

  return { ok: true, analysis, findings: aggregated, health }
}
