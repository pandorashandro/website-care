import type { RawFinding, RawFindingPageEvidence, AggregatedFinding, Confidence, CheckKey } from './types'
import { getActionability } from './actionability'
import { adjustSeverity } from '@/lib/category-engine/severity'

/**
 * Phase 29 — turns every Content analyzer's raw output for one analysis
 * into the final, persistence-ready findings. Mirrors
 * lib/on-page/aggregate.ts's proven logic exactly (grouping by checkKey,
 * merging severity/confidence, deduplicating by (url, affectedResourceUrl),
 * computing the three-way affectedPageCount/occurrenceCount/
 * uniqueTargetCount distinction) — intentionally kept as its own copy for
 * the same documented reason every prior engine's aggregate.ts gives
 * (CheckKey/FindingCategory differ per engine; a genuine future candidate
 * for lib/category-engine/ extraction, not done here to avoid touching
 * already-accepted code).
 *
 * `kind`/`evidenceSource` are carried through from the primary (highest
 * severity) raw instance — every Content check emits exactly ONE RawFinding
 * per analysis run with a fixed kind/evidenceSource, so there is never a
 * mixed-kind group to reconcile.
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

    const affectedPageCount = new Set(affectedPages.map((page) => page.url)).size
    const occurrenceCount = affectedPages.length
    const uniqueTargetCount = new Set(affectedPages.map((page) => page.affectedResourceUrl).filter((url): url is string => !!url)).size

    const finalSeverity = adjustSeverity(mergedBaseSeverity, mergedConfidence, affectedPageCount, totalAnalyzedPages)

    const mergedEvidence = instances.reduce<Record<string, unknown>>((acc, instance) => ({ ...acc, ...instance.evidence }), {})

    aggregated.push({
      checkKey,
      category: primary.category,
      scope: primary.scope,
      kind: primary.kind,
      evidenceSource: primary.evidenceSource,
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
