import type { RawFinding, RawFindingPageEvidence, AggregatedFinding, Confidence, CheckKey } from './types'
import { getActionability } from './actionability'
import { adjustSeverity } from './severity'

/**
 * Phase 26 — turns every analyzer's raw output for one analysis into the
 * final, persistence-ready findings: one row per distinct check_key
 * (technical_findings' own unique constraint), each carrying the full,
 * deduplicated set of affected instances.
 *
 * Two different things get merged here, both intentionally:
 *
 * 1. MULTIPLE RawFindings SHARING ONE checkKey (e.g. crawlability.ts can
 *    emit two separate `internal_page_4xx` instances — one for 404s, one
 *    for other 4xx codes — with different explanatory text). These are
 *    combined into ONE finding: severity is the HIGHEST of the merged
 *    instances (a 404 present means the finding is at least that severe),
 *    confidence is the LOWEST/most-conservative of the merged instances,
 *    and title/explanation/why-it-matters/recommendation are taken from
 *    whichever instance had the highest severity (ties broken by which
 *    appeared first) — never silently blended into vaguer text.
 * 2. AFFECTED INSTANCES for the same checkKey, deduplicated by
 *    (url, affectedResourceUrl) — Phase 26B's correction to Phase 26A's
 *    dedupe-by-url-alone logic. A page-level defect still dedupes to one
 *    row per page (affectedResourceUrl is always null there, so the key
 *    collapses to just `url`, exactly like before). A RELATIONSHIP defect
 *    (Checkpoint 9: one source page can link to TWO different broken/
 *    redirecting targets) now correctly keeps BOTH instances instead of
 *    silently dropping the second just because they share a source `url`.
 *
 * Severity adjustment (confidence capping, spread-based escalation) happens
 * ONCE here, after merging and deduplication, using the FINAL distinct
 * source-page count and confidence — never on each analyzer's raw, pre-merge
 * output, so a check split across two RawFinding instances is judged by its
 * true combined spread, not two smaller, individually-unremarkable ones.
 */
const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }
const SEVERITY_RANK: Record<RawFinding['baseSeverity'], number> = { low: 0, medium: 1, high: 2, critical: 3 }

function instanceKey(instance: RawFindingPageEvidence): string {
  return `${instance.url}|${instance.affectedResourceUrl ?? ''}`
}

function dedupeInstances(instances: RawFindingPageEvidence[]): RawFindingPageEvidence[] {
  const seen = new Map<string, RawFindingPageEvidence>()
  for (const instance of instances) {
    const key = instanceKey(instance)
    if (!seen.has(key)) seen.set(key, instance)
  }
  return Array.from(seen.values())
}

export function aggregateFindings(rawFindings: RawFinding[], totalAnalyzedPages: number): AggregatedFinding[] {
  const groups = new Map<CheckKey, RawFinding[]>()

  for (const finding of rawFindings) {
    const existing = groups.get(finding.checkKey) ?? []
    existing.push(finding)
    groups.set(finding.checkKey, existing)
  }

  const aggregated: AggregatedFinding[] = []

  for (const [checkKey, instances] of groups) {
    // Highest-severity instance wins for copy — sorted stably so a tie
    // keeps the first analyzer-emitted instance's wording.
    const sortedBySeverityDesc = instances
      .map((instance, index) => ({ instance, index }))
      .sort((a, b) => SEVERITY_RANK[b.instance.baseSeverity] - SEVERITY_RANK[a.instance.baseSeverity] || a.index - b.index)
    const primary = sortedBySeverityDesc[0].instance

    const mergedBaseSeverity = instances.reduce(
      (max, instance) => (SEVERITY_RANK[instance.baseSeverity] > SEVERITY_RANK[max] ? instance.baseSeverity : max),
      instances[0].baseSeverity
    )
    const mergedConfidence = instances.reduce(
      (min, instance) => (CONFIDENCE_RANK[instance.confidence] < CONFIDENCE_RANK[min] ? instance.confidence : min),
      instances[0].confidence
    )

    const affectedPages = dedupeInstances(instances.flatMap((instance) => instance.affectedPages))

    // Checkpoint 9/10 — three genuinely different numbers, never conflated:
    const affectedPageCount = new Set(affectedPages.map((page) => page.url)).size
    const occurrenceCount = affectedPages.length
    const uniqueTargetCount = new Set(affectedPages.map((page) => page.affectedResourceUrl).filter((url): url is string => !!url)).size

    const finalSeverity = adjustSeverity(mergedBaseSeverity, mergedConfidence, affectedPageCount, totalAnalyzedPages)

    const mergedEvidence = instances.reduce<Record<string, unknown>>((acc, instance) => ({ ...acc, ...instance.evidence }), {})

    aggregated.push({
      checkKey,
      category: primary.category,
      scope: primary.scope,
      severity: finalSeverity,
      confidence: mergedConfidence,
      title: primary.title,
      explanation: primary.explanation,
      whyItMatters: primary.whyItMatters,
      recommendation: primary.recommendation,
      evidence: mergedEvidence,
      affectedPages,
      affectedPageCount,
      occurrenceCount,
      uniqueTargetCount,
      actionability: getActionability(checkKey),
      estimatedImpact: primary.estimatedImpact ?? null,
      effort: primary.effort ?? null,
      risk: primary.risk ?? null,
    })
  }

  return aggregated
}
