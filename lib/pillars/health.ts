import type { Severity, Confidence, FindingScope, FindingKind } from './types'
import { SEVERITY_DEDUCTION, CONFIDENCE_MULTIPLIER, SEVERITY_TIER_CAP, fractionSpread, clampScore } from '@/lib/category-engine/health'

/**
 * Unified webioom engine, Prompt 2 — shared health-score formula for
 * Performance/Accessibility/Security, built on the SAME
 * lib/category-engine/health.ts primitives every other engine uses.
 * Identical Problem-vs-Opportunity rule as Content Intelligence: an
 * 'opportunity'-kind finding NEVER enters the deduction sum, regardless of
 * its own severity/confidence.
 */
export type HealthFindingInput = {
  checkKey?: string
  severity: Severity
  confidence: Confidence
  scope: FindingScope
  kind: FindingKind
  affectedPageCount: number
  occurrenceCount: number
  uniqueTargetCount?: number
}

export type PillarHealth = { score: number; findingsCount: number; problemCount: number; opportunityCount: number; severityCounts: Record<Severity, number> }

function findingDeduction(finding: HealthFindingInput, totalAnalyzedPages: number): number {
  if (finding.kind === 'opportunity') return 0
  const spread = finding.scope === 'site' ? 1 : fractionSpread(finding.affectedPageCount, totalAnalyzedPages)
  return SEVERITY_DEDUCTION[finding.severity] * CONFIDENCE_MULTIPLIER[finding.confidence] * spread
}

export function calculatePillarHealth(findings: HealthFindingInput[], totalAnalyzedPages: number): PillarHealth {
  const tierDeductions: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  const severityCounts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  let problemCount = 0
  let opportunityCount = 0

  for (const finding of findings) {
    severityCounts[finding.severity]++
    if (finding.kind === 'opportunity') opportunityCount++
    else problemCount++
    tierDeductions[finding.severity] += findingDeduction(finding, totalAnalyzedPages)
  }

  let totalDeduction = 0
  for (const severity of Object.keys(tierDeductions) as Severity[]) {
    totalDeduction += Math.min(tierDeductions[severity], SEVERITY_TIER_CAP[severity])
  }

  return { score: clampScore(Math.round(100 - totalDeduction)), findingsCount: findings.length, problemCount, opportunityCount, severityCounts }
}
