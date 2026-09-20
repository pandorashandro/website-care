import type { PillarStore } from './store'
import type { PillarAnalyzerContext } from './context'
import { completedPages, type CrawlEvidence } from '@/lib/crawler/evidence'
import { isEligibleContentPage } from '@/lib/category-engine/eligibility'
import { aggregatePillarFindings } from './aggregate'
import { calculatePillarHealth, type PillarHealth } from './health'
import type { AggregatedFinding, RawFinding, PillarKey } from './types'
import type { CrawlAnalysisRow } from '@/lib/technical-seo/types'

/**
 * Unified webioom engine, Prompt 2 — ONE generic analysis engine shared by
 * Performance/Accessibility/Security. Each pillar's own
 * `lib/<pillar>/run-analysis.ts` is a thin wrapper supplying its own check
 * list/analyzer version/pillar key to this function — see this module's own
 * doc comment in lib/pillars/types.ts for why these three share this much
 * infrastructure while every earlier engine has its own copy.
 *
 * ELIGIBILITY: reuses the SAME shared `isEligibleContentPage` gate every
 * other category engine uses (2xx HTML, not noindex, self-canonical) —
 * deliberately consistent rather than inventing a fourth variant, even
 * though Performance/Accessibility findings would arguably still be
 * meaningful on a noindex page. Consistency here means a page counted as
 * "eligible" means the same thing everywhere in the product.
 *
 * Pipeline: crawl evidence -> eligible pages -> every deterministic check
 * -> aggregation/deduplication -> severity/confidence -> persisted
 * findings. Per-check isolation (one throwing check is skipped, never
 * discards what the others already produced) mirrors every other engine.
 */
export type AnalyzePillarResult =
  | { ok: true; analysis: CrawlAnalysisRow; findings: AggregatedFinding[]; health: PillarHealth }
  | { ok: false; error: string }

const ANALYZABLE_CRAWL_STATUSES = new Set(['completed', 'partial'])

export async function runPillarAnalysis(
  pillar: PillarKey,
  analyzerVersion: string,
  checks: ((context: PillarAnalyzerContext) => RawFinding[])[],
  store: PillarStore,
  crawlRunId: string
): Promise<AnalyzePillarResult> {
  const evidence: CrawlEvidence | null = await store.getCrawlEvidence(crawlRunId)
  if (!evidence) return { ok: false, error: 'Crawl not found.' }

  if (!ANALYZABLE_CRAWL_STATUSES.has(evidence.crawlRun.status)) {
    return { ok: false, error: 'This crawl has not finished yet — analysis requires a completed or partial crawl.' }
  }

  const eligiblePages = evidence.pages.filter(isEligibleContentPage)

  const context: PillarAnalyzerContext = {
    eligiblePages,
    totalAnalyzedPages: completedPages(evidence).length,
    isPartialCrawl: evidence.crawlRun.status === 'partial',
  }

  const rawFindings: RawFinding[] = []
  for (const check of checks) {
    try {
      rawFindings.push(...check(context))
    } catch {
      // Isolation: a broken check is skipped, never allowed to discard
      // findings the other checks already produced.
    }
  }

  const aggregated = aggregatePillarFindings(rawFindings, context.totalAnalyzedPages)
  const health = calculatePillarHealth(
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

  const analysis = await store.saveAnalysis({
    pillar,
    crawlRunId,
    websiteId: evidence.crawlRun.website_id,
    analyzerVersion,
    findings: aggregated,
    healthScore: health.score,
  })

  return { ok: true, analysis, findings: aggregated, health }
}
