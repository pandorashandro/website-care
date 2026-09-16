import type { TechnicalSeoStore } from './store'
import { buildPageIndex, buildInboundLinkCounts, completedPages, type CrawlEvidence } from './evidence'
import type { AnalyzerContext } from './context'
import { analyzeCrawlability } from './checks/crawlability'
import { analyzeIndexability } from './checks/indexability'
import { analyzeCanonicals } from './checks/canonicals'
import { analyzeRedirects } from './checks/redirects'
import { analyzeRobots } from './checks/robots'
import { analyzeSitemap } from './checks/sitemap'
import { analyzeUrlProtocol } from './checks/url-protocol'
import { analyzeTechnicalPageSignals } from './checks/technical-page'
import { analyzeStructuredData } from './checks/structured-data'
import { analyzeHreflang } from './checks/hreflang'
import { analyzeSiteWideConsistency } from './checks/site-wide'
import { aggregateFindings } from './aggregate'
import { calculateTechnicalSeoHealth, type TechnicalSeoHealth } from './health'
import { ANALYZER_VERSION } from './types'
import type { RawFinding, CrawlAnalysisRow, AggregatedFinding } from './types'

/**
 * Phase 26, Checkpoint 3/9 — the analysis engine's orchestration entry
 * point:
 *
 *   crawl evidence -> technical analyzers -> structured findings ->
 *   aggregation/deduplication -> severity/confidence -> persisted findings
 *
 * Deliberately NOT coupled to lib/crawler/engine.ts's own execution model —
 * CRAWL and ANALYZE are distinct lifecycle steps (Checkpoint 9's explicit
 * instruction). Analysis is pure, read-only computation over ALREADY-fetched
 * evidence (no network calls of any kind), so unlike crawling it needs no
 * batching/resumability of its own: one call analyzes an entire crawl_run in
 * one pass, however many pages it covered, and either fully succeeds or
 * fails outright — it never leaves a half-analyzed run needing a second
 * invocation to finish.
 */

export type AnalyzeTechnicalSeoResult =
  | { ok: true; analysis: CrawlAnalysisRow; findings: AggregatedFinding[]; health: TechnicalSeoHealth }
  | { ok: false; error: string }

/** Analysis requires a crawl that actually finished running — a queued/running crawl has no stable evidence yet, and a failed/cancelled one never produced meaningful evidence to analyze. */
const ANALYZABLE_CRAWL_STATUSES = new Set(['completed', 'partial'])

type Analyzer = (evidence: CrawlEvidence, context: AnalyzerContext) => RawFinding[]

const ANALYZERS: Analyzer[] = [
  (evidence) => analyzeCrawlability(evidence),
  (evidence, context) => analyzeIndexability(evidence, context),
  (evidence, context) => analyzeCanonicals(evidence, context),
  (evidence, context) => analyzeRedirects(evidence, context),
  (evidence) => analyzeRobots(evidence),
  (evidence, context) => analyzeSitemap(evidence, context),
  (evidence) => analyzeUrlProtocol(evidence),
  (evidence) => analyzeTechnicalPageSignals(evidence),
  (evidence) => analyzeStructuredData(evidence),
  (evidence, context) => analyzeHreflang(evidence, context),
  (evidence) => analyzeSiteWideConsistency(evidence),
]

/**
 * Runs every analyzer over `crawlRunId`'s persisted evidence and saves the
 * result. Deterministic given unchanged crawl evidence and analyzer version
 * (every analyzer is a pure function; aggregation/severity are pure too),
 * and safe to call repeatedly — store.saveAnalysis replaces the prior
 * (crawl_run_id, analyzer_version) result wholesale rather than
 * accumulating duplicates (Checkpoint 9).
 *
 * Per-analyzer isolation: one analyzer throwing is caught and skipped
 * individually, so a bug in a single check can never destroy the findings
 * every OTHER analyzer already produced. Only evidence loading itself
 * failing (crawl_run not found) or the crawl not yet being in an analyzable
 * state returns `ok: false` — the crawl's own evidence is never written to
 * by this module, so an analysis failure can never corrupt it.
 */
export async function analyzeTechnicalSeo(store: TechnicalSeoStore, crawlRunId: string): Promise<AnalyzeTechnicalSeoResult> {
  const evidence = await store.getCrawlEvidence(crawlRunId)
  if (!evidence) return { ok: false, error: 'Crawl not found.' }

  if (!ANALYZABLE_CRAWL_STATUSES.has(evidence.crawlRun.status)) {
    return { ok: false, error: 'This crawl has not finished yet — analysis requires a completed or partial crawl.' }
  }

  const context: AnalyzerContext = {
    pageIndex: buildPageIndex(evidence),
    inboundLinkCounts: buildInboundLinkCounts(evidence),
    totalAnalyzedPages: completedPages(evidence).length,
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
  const health = calculateTechnicalSeoHealth(
    aggregated.map((finding) => ({ severity: finding.severity, confidence: finding.confidence, scope: finding.scope, affectedPageCount: finding.affectedPageCount })),
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
