import type { OnPageStore } from './store'
import type { AnalyzerContext } from './context'
import { completedPages, type CrawlEvidence } from '@/lib/crawler/evidence'
import { isOnPageEligiblePage } from './eligibility'
import { analyzeTitleLength, analyzeWeakTitle } from './checks/title'
import { analyzeDuplicateTitles } from './checks/duplicate-title'
import { analyzeMetaDescriptionLength } from './checks/meta-description'
import { analyzeDuplicateMetaDescriptions } from './checks/duplicate-meta-description'
import { analyzeHeadingStructure } from './checks/headings'
import { aggregateFindings } from './aggregate'
import { calculateOnPageHealth, type OnPageHealth } from './health'
import { computeOnPageCoverage, type OnPageAnalysisCoverage } from './coverage'
import { ANALYZER_VERSION } from './types'
import type { AggregatedFinding, RawFinding, OnPageAnalysisRow } from './types'

/**
 * Phase 28 — the On-Page SEO analysis engine's orchestration entry point,
 * mirroring lib/architecture/run-analysis.ts's proven pipeline exactly:
 *
 *   crawl evidence -> eligible pages -> on-page checks -> structured
 *   findings -> aggregation/deduplication -> severity/confidence ->
 *   persisted findings
 *
 * Pure, read-only computation over already-fetched crawl evidence — no
 * network calls, no batching/resumability needed.
 */

export type AnalyzeOnPageResult =
  | { ok: true; analysis: OnPageAnalysisRow; findings: AggregatedFinding[]; health: OnPageHealth; coverage: OnPageAnalysisCoverage }
  | { ok: false; error: string }

const ANALYZABLE_CRAWL_STATUSES = new Set(['completed', 'partial'])

const ANALYZERS: ((context: AnalyzerContext) => RawFinding[])[] = [
  (context) => analyzeTitleLength(context),
  (context) => analyzeWeakTitle(context),
  (context) => analyzeDuplicateTitles(context),
  (context) => analyzeMetaDescriptionLength(context),
  (context) => analyzeDuplicateMetaDescriptions(context),
  (context) => analyzeHeadingStructure(context),
]

/**
 * Runs every On-Page analyzer over `crawlRunId`'s persisted evidence and
 * saves the result. Deterministic, idempotent (store.saveAnalysis replaces
 * the prior (crawl_run_id, analyzer_version) result wholesale), and
 * per-analyzer isolated (one analyzer throwing is caught and skipped
 * individually) — identical guarantees to Technical SEO's and Site
 * Architecture's own engines, for identical reasons.
 */
export async function analyzeOnPage(store: OnPageStore, crawlRunId: string): Promise<AnalyzeOnPageResult> {
  const evidence: CrawlEvidence | null = await store.getCrawlEvidence(crawlRunId)
  if (!evidence) return { ok: false, error: 'Crawl not found.' }

  if (!ANALYZABLE_CRAWL_STATUSES.has(evidence.crawlRun.status)) {
    return { ok: false, error: 'This crawl has not finished yet — analysis requires a completed or partial crawl.' }
  }

  const context: AnalyzerContext = {
    eligiblePages: evidence.pages.filter(isOnPageEligiblePage),
    totalAnalyzedPages: completedPages(evidence).length,
    isPartialCrawl: evidence.crawlRun.status === 'partial',
  }

  const rawFindings: RawFinding[] = []
  for (const analyzer of ANALYZERS) {
    try {
      rawFindings.push(...analyzer(context))
    } catch {
      // Isolation: a broken analyzer is skipped, never allowed to discard
      // findings the other analyzers already produced.
    }
  }

  const aggregated = aggregateFindings(rawFindings, context.totalAnalyzedPages)
  const health = calculateOnPageHealth(
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

  // Founder-reported bug (2026-09-22) — see lib/on-page/coverage.ts. Computed
  // from the SAME eligiblePages/totalAnalyzedPages the checks above already
  // used, so coverage can never drift from what actually happened.
  const coverage = computeOnPageCoverage(context.eligiblePages.length, context.totalAnalyzedPages)

  // Scoring Engine V1 calibration (2026-09-24): a prior pass capped the
  // score whenever coverage.level === 'low' (exactly 1 eligible page).
  // Removed — unlike Site Architecture, On-Page's per-page checks
  // (title/meta/heading existence, length, genericness) are FULLY
  // applicable and meaningful on a single page; only the CROSS-page
  // comparison checks (duplicate_title/duplicate_meta_description) cannot
  // run with 1 page, and they correctly, honestly return no finding rather
  // than a false pass (see coverage.ts's own `comparisonChecksAssessed`
  // flag, which the UI already surfaces as a "Limited data" disclosure).
  // Capping an otherwise fully-earned per-page score for a LIMITATION of a
  // different, inapplicable check was a category error — see
  // docs/scoring-contract-v1.md. A single genuinely well-formed page can
  // now legitimately score 100 on this pillar; a single page with real
  // title/meta/heading defects scores exactly what those defects earn.
  const analysis = await store.saveAnalysis({
    crawlRunId,
    websiteId: evidence.crawlRun.website_id,
    analyzerVersion: ANALYZER_VERSION,
    findings: aggregated,
    healthScore: health.score,
    coverage,
  })

  return { ok: true, analysis, findings: aggregated, health, coverage }
}
