import type { RawFinding, AggregatedFinding, Confidence } from './types'
import type { RawFindingPageEvidence } from '@/lib/category-engine/types'
import { adjustSeverity } from '@/lib/category-engine/severity'

/**
 * Unified webioom engine, Prompt 2 — turns one pillar's raw check output
 * into final, persistence-ready findings. Mirrors lib/content/aggregate.ts/
 * lib/on-page/aggregate.ts's proven logic exactly (grouping by checkKey,
 * merging severity/confidence, deduplicating by (url, affectedResourceUrl),
 * computing the three-way affectedPageCount/occurrenceCount/
 * uniqueTargetCount distinction). Generic over `checkKey: string` (see
 * lib/pillars/types.ts's own doc comment for why) so this ONE module is
 * shared by all three new pillars rather than copied three times.
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

export function aggregatePillarFindings(rawFindings: RawFinding[], totalAnalyzedPages: number): AggregatedFinding[] {
  const groups = new Map<string, RawFinding[]>()

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
      actionability: primary.actionability,
      estimatedImpact: primary.estimatedImpact ?? null,
      effort: primary.effort ?? null,
      risk: primary.risk ?? null,
    })
  }

  return aggregated
}
