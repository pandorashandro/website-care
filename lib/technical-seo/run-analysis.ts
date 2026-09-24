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
import { computeTechnicalSeoCoverage, type TechnicalSeoCoverage } from './coverage'
import { computeSiteAccessState } from '@/lib/category-engine/site-access'
import { ANALYZER_VERSION } from './types'
import type { RawFinding, AggregatedFinding, TechnicalSeoAnalysisRow, CheckKey } from './types'

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
  | { ok: true; analysis: TechnicalSeoAnalysisRow; findings: AggregatedFinding[]; health: TechnicalSeoHealth; coverage: TechnicalSeoCoverage }
  | { ok: false; error: string }

/** Analysis requires a crawl that actually finished running — a queued/running crawl has no stable evidence yet, and a failed/cancelled one never produced meaningful evidence to analyze. */
const ANALYZABLE_CRAWL_STATUSES = new Set(['completed', 'partial'])

type Analyzer = (evidence: CrawlEvidence, context: AnalyzerContext) => RawFinding[]

/**
 * Founder-verified correction (2026-09-22, follow-up): when
 * `computeSiteAccessState()` reports the ENTIRE crawl was blocked or
 * fetch-failed (e.g. every request, including robots.txt/sitemap.xml, hit
 * the same firewall/bot-protection rule), these four checkKeys stop being
 * independent, confirmed website defects — they are three-to-four symptoms
 * of ONE underlying access-denial event, and scoring all of them
 * independently triple-penalizes a website for webioom's own inability to
 * get in. An ISOLATED 4xx/5xx on an otherwise-accessible or
 * partially-accessible crawl (computeSiteAccessState !== 'blocked' &&
 * !== 'fetch_failed') is UNAFFECTED by this filter and continues to score
 * normally — this is a narrow, evidence-gated suppression, not a general
 * "hide errors" rule. See lib/technical-seo/coverage.ts's own doc comment
 * for the matching coverage-level correction.
 */
const SUPPRESSED_ON_BLOCKED_ACCESS: ReadonlySet<CheckKey> = new Set(['internal_page_4xx', 'internal_page_5xx', 'robots_unreachable', 'sitemap_unavailable'])

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

  // Founder-verified correction (2026-09-22, follow-up) — see
  // SUPPRESSED_ON_BLOCKED_ACCESS's own doc comment. Filtering here, once,
  // before aggregation/scoring/persistence, is what stops these findings
  // from EVER reaching technical_findings — so they can never surface via
  // Fix These First either, without Fix These First needing to know
  // anything about site-access state itself.
  //
  // Wrapped in the SAME per-step isolation guarantee as the analyzer loop
  // above: malformed page evidence (e.g. a getter that throws) must not
  // crash the whole analysis just because THIS one classification step
  // touched it — failing open to 'accessible' (never suppress) is the safe
  // default, since suppressing findings on a classification we couldn't
  // trust would risk hiding genuine evidence.
  let siteAccessState: ReturnType<typeof computeSiteAccessState> = 'accessible'
  try {
    siteAccessState = computeSiteAccessState(evidence.pages)
  } catch {
    // Isolation — see comment above.
  }
  const eligibleFindings =
    siteAccessState === 'blocked' || siteAccessState === 'fetch_failed'
      ? rawFindings.filter((finding) => !SUPPRESSED_ON_BLOCKED_ACCESS.has(finding.checkKey))
      : rawFindings

  const aggregated = aggregateFindings(eligibleFindings, context.totalAnalyzedPages)
  const health = calculateTechnicalSeoHealth(
    aggregated.map((finding) => ({ severity: finding.severity, confidence: finding.confidence, scope: finding.scope, affectedPageCount: finding.affectedPageCount })),
    context.totalAnalyzedPages
  )

  // Evidence-aware health scoring (2026-09-22) — see lib/technical-seo/coverage.ts.
  // Passes the ALREADY-computed (and isolation-guarded) siteAccessState
  // through rather than letting this recompute it a second time.
  const coverage = computeTechnicalSeoCoverage(evidence.pages, evidence.crawlRun, siteAccessState)

  // Scoring Engine V1 calibration (2026-09-24): a prior pass capped the
  // score whenever coverage.level === 'low'. Removed — 'low' means zero
  // pages cleared the narrow isSuccessfulHtmlFetch bar (e.g. a
  // non-HTML-only site) despite some completed fetches, but crawlability/
  // robots/sitemap/URL-protocol checks remain fully applicable and
  // evidence-backed in that case (they do not require HTML content — see
  // lib/technical-seo/coverage.ts's own doc comment). Only the
  // HTML-content-dependent checks (indexability/canonical/structured-data/
  // hreflang) have nothing to evaluate, which is an honest NOT_APPLICABLE
  // for those specific checks, not a reason to discount the whole pillar's
  // otherwise-genuine score. A normal single-HTML-page site was already
  // unaffected ('adequate' coverage) — see docs/scoring-contract-v1.md.
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
