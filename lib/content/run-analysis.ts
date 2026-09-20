import type { ContentStore } from './store'
import type { AnalyzerContext, PageContext } from './context'
import { completedPages, type CrawlEvidence } from '@/lib/crawler/evidence'
import { isContentEligiblePage, getExtractionConfidence } from './eligibility'
import { hasLikelyAuxiliaryUrlSignal } from '@/lib/category-engine/eligibility'
import { classifyPageType } from './page-purpose'
import { analyzeThinContent } from './checks/thin-content'
import { analyzeExactDuplicateContent } from './checks/exact-duplicate'
import { analyzeHighlyRepetitivePages } from './checks/repetitive'
import { analyzeWeakContentStructure } from './checks/weak-structure'
import { analyzeFaqOpportunity } from './checks/faq-opportunity'
import { analyzePagePurposeSummary } from './checks/page-purpose-summary'
import { analyzeContentCompletenessWithAi, type CompletenessAiHook } from './checks/completeness-ai'
import { aggregateFindings } from './aggregate'
import { calculateContentHealth, type ContentHealth } from './health'
import { computeDimensionStatuses } from './dimensions'
import { computeContentAnalysisCoverage, type ContentAnalysisCoverage } from './coverage'
import { ANALYZER_VERSION } from './types'
import type { AggregatedFinding, RawFinding, ContentAnalysisRow } from './types'

/**
 * Phase 29 — the Content Intelligence analysis engine's orchestration entry
 * point, mirroring lib/on-page/run-analysis.ts's proven pipeline exactly:
 *
 *   crawl evidence -> eligible pages (+ page type + extraction confidence)
 *   -> deterministic content checks -> OPTIONAL bounded AI interpretation
 *   -> structured findings -> aggregation/deduplication -> severity/
 *   confidence -> persisted findings
 *
 * Pure, read-only computation over already-fetched crawl evidence — no
 * network calls in the DEFAULT (deterministic-only) path.
 *
 * AI INTERPRETATION (Phase 29 targeted completion pass): `analyzeContent`'s
 * optional `completenessAiHook` parameter is the seam
 * `app/dashboard/websites/[id]/content-actions.ts` (the real production
 * caller) now passes `interpretContentCompleteness` through — so a real
 * Content analysis DOES make bounded, cost-controlled AI calls today. The
 * full AI architecture (lib/content/ai/completeness-interpretation.ts,
 * lib/content/checks/completeness-ai.ts) follows every requirement
 * (prompt-injection defense, structured-output validation, bounded input,
 * timeout/failure handling, deterministic fallback, bounded score impact —
 * every AI-derived finding is `kind: 'opportunity'` in this initial release,
 * regardless of the AI's own self-reported confidence). Plan-based
 * budget/entitlement gating and content_hash-keyed caching across re-crawls
 * remain documented, NOT-yet-built future scope (see
 * docs/content-intelligence-engine.md's "AI architecture"/"AI cost
 * control" sections) — every call today is a genuine, uncached Anthropic
 * request, bounded only by AI_MAX_PAGES_PER_ANALYSIS per analysis. The
 * parameter remains OPTIONAL specifically so tests (and any future caller
 * that should not make live AI calls, e.g. a bulk/background job) can omit
 * it or inject a fake — when omitted, or when the hook fails/throws, a
 * single failure never fails the overall analysis: deterministic findings
 * are always computed first and persist regardless of what the optional AI
 * step does.
 */

export type AnalyzeContentOptions = {
  completenessAiHook?: CompletenessAiHook
}

export type AnalyzeContentResult =
  | { ok: true; analysis: ContentAnalysisRow; findings: AggregatedFinding[]; health: ContentHealth; coverage: ContentAnalysisCoverage }
  | { ok: false; error: string }

const ANALYZABLE_CRAWL_STATUSES = new Set(['completed', 'partial'])

const DETERMINISTIC_ANALYZERS: ((context: AnalyzerContext) => RawFinding[])[] = [
  (context) => analyzeThinContent(context),
  (context) => analyzeExactDuplicateContent(context),
  (context) => analyzeHighlyRepetitivePages(context),
  (context) => analyzeWeakContentStructure(context),
  (context) => analyzeFaqOpportunity(context),
  (context) => analyzePagePurposeSummary(context),
]

/**
 * Runs every Content analyzer over `crawlRunId`'s persisted evidence and
 * saves the result. Deterministic, idempotent (store.saveAnalysis replaces
 * the prior (crawl_run_id, analyzer_version) result wholesale), and
 * per-analyzer isolated (one analyzer throwing is caught and skipped
 * individually) — identical guarantees to every other category engine.
 */
export async function analyzeContent(store: ContentStore, crawlRunId: string, options?: AnalyzeContentOptions): Promise<AnalyzeContentResult> {
  const evidence: CrawlEvidence | null = await store.getCrawlEvidence(crawlRunId)
  if (!evidence) return { ok: false, error: 'Crawl not found.' }

  if (!ANALYZABLE_CRAWL_STATUSES.has(evidence.crawlRun.status)) {
    return { ok: false, error: 'This crawl has not finished yet — analysis requires a completed or partial crawl.' }
  }

  const eligiblePages: PageContext[] = evidence.pages.filter(isContentEligiblePage).map((page) => ({
    page,
    pageType: classifyPageType(page, page.depth === 0),
    extractionConfidence: getExtractionConfidence(page),
    hasAuxiliaryUrlSignal: hasLikelyAuxiliaryUrlSignal(page),
  }))

  const context: AnalyzerContext = {
    eligiblePages,
    totalAnalyzedPages: completedPages(evidence).length,
    isPartialCrawl: evidence.crawlRun.status === 'partial',
  }

  const rawFindings: RawFinding[] = []
  for (const analyzer of DETERMINISTIC_ANALYZERS) {
    try {
      rawFindings.push(...analyzer(context))
    } catch {
      // Isolation: a broken analyzer is skipped, never allowed to discard
      // findings the other analyzers already produced.
    }
  }

  // Optional, bounded AI interpretation — see this module's own doc
  // comment. Isolated at the TOP level too: if the entire AI step throws
  // for any reason, the deterministic findings already computed above are
  // still used, never discarded.
  if (options?.completenessAiHook) {
    try {
      rawFindings.push(...(await analyzeContentCompletenessWithAi(context, options.completenessAiHook)))
    } catch {
      // AI failure must not fail the whole Content analysis.
    }
  }

  const aggregated = aggregateFindings(rawFindings, context.totalAnalyzedPages)
  const health = calculateContentHealth(
    aggregated.map((finding) => ({
      checkKey: finding.checkKey,
      severity: finding.severity,
      confidence: finding.confidence,
      scope: finding.scope,
      kind: finding.kind,
      affectedPageCount: finding.affectedPageCount,
      occurrenceCount: finding.occurrenceCount,
      uniqueTargetCount: finding.uniqueTargetCount,
    })),
    context.totalAnalyzedPages
  )

  // Phase 29 targeted completion pass — Analysis Coverage. Computed from
  // the SAME aggregated findings/dimension statuses the dedicated Content
  // page itself derives, so coverage can never drift from what the report
  // actually shows. See lib/content/coverage.ts for the documented formula.
  const dimensions = computeDimensionStatuses({
    findings: aggregated.map((finding) => ({ checkKey: finding.checkKey, kind: finding.kind, evidence: finding.evidence })),
    eligiblePageCount: eligiblePages.length,
  })
  const purposeFinding = aggregated.find((finding) => finding.checkKey === 'page_purpose_summary')
  const lowExtractionConfidenceCount =
    typeof purposeFinding?.evidence.lowExtractionConfidenceCount === 'number'
      ? (purposeFinding.evidence.lowExtractionConfidenceCount as number)
      : eligiblePages.filter((p) => p.extractionConfidence === 'low').length
  const coverage = computeContentAnalysisCoverage({ eligiblePageCount: eligiblePages.length, lowExtractionConfidenceCount, dimensions })

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
