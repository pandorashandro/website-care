import type { Severity, Confidence, FindingScope } from './types'
import { SEVERITY_DEDUCTION, CONFIDENCE_MULTIPLIER, SEVERITY_TIER_CAP, fractionSpread, clampScore } from '@/lib/category-engine/health'

/**
 * Phase 28 — On-Page SEO health score. Built on the shared
 * lib/category-engine/health.ts primitives (see that module's own doc
 * comment for why the formula is shared here, unlike Technical SEO's and
 * Site Architecture's own still-independent copies).
 *
 * Deduction per finding:
 *
 *   spread     = fractionSpread(affectedPageCount, totalAnalyzedPages)
 *   deduction  = SEVERITY_DEDUCTION[severity] x CONFIDENCE_MULTIPLIER[confidence] x spread
 *
 * NO occurrence-aware max() the way Site Architecture's health.ts needs
 * (Phase 27's own score-calibration correction): that correction exists
 * specifically for EDGE-based checks, where one source page can have many
 * distinct broken/redirect target edges, making occurrenceCount potentially
 * far larger than affectedPageCount. Every On-Page V1 check — including
 * duplicate_title/duplicate_meta_description — has exactly ONE evidence
 * instance per affected page by construction (see duplicate-title.ts's own
 * doc comment), so occurrenceCount === affectedPageCount always holds
 * today. `occurrenceCount` is still carried on HealthFindingInput (for
 * schema/shape consistency with the other two engines and for future
 * checks that might genuinely need it), but the spread calculation uses
 * affectedPageCount directly rather than reintroducing unneeded max()
 * machinery for a distinction that does not currently exist here — this is
 * the "do not force every check into identical spread semantics" instruction
 * applied honestly, not an oversight.
 *
 * DUPLICATE-GROUP STRUCTURE (`uniqueTargetCount` — the number of distinct
 * duplicate groups for duplicate_title/duplicate_meta_description) is
 * likewise NOT a scoring input — see duplicate-title.ts's own doc comment
 * and this repo's docs/on-page-seo-engine.md for the full reasoning: group
 * count reflects fix EFFORT (how many distinct root values need editing),
 * not how degraded the page's current search presentation is TODAY, which
 * is what this score measures. It is threaded through to
 * explainOnPageHealth purely for explainability.
 *
 * ANTI-GAMING: per-severity-tier caps (identical constants to both other
 * engines) ensure a long tail of low-value findings can never drag the
 * score down as much as one genuine high/critical problem.
 */

export type HealthFindingInput = {
  checkKey?: string
  severity: Severity
  confidence: Confidence
  scope: FindingScope
  affectedPageCount: number
  occurrenceCount: number
  uniqueTargetCount?: number
}

export type OnPageHealth = { score: number; findingsCount: number; severityCounts: Record<Severity, number> }

function findingDeduction(finding: HealthFindingInput, totalAnalyzedPages: number): number {
  const spread = finding.scope === 'site' ? 1 : fractionSpread(finding.affectedPageCount, totalAnalyzedPages)
  return SEVERITY_DEDUCTION[finding.severity] * CONFIDENCE_MULTIPLIER[finding.confidence] * spread
}

export function calculateOnPageHealth(findings: HealthFindingInput[], totalAnalyzedPages: number): OnPageHealth {
  const tierDeductions: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  const severityCounts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }

  for (const finding of findings) {
    severityCounts[finding.severity]++
    tierDeductions[finding.severity] += findingDeduction(finding, totalAnalyzedPages)
  }

  let totalDeduction = 0
  for (const severity of Object.keys(tierDeductions) as Severity[]) {
    totalDeduction += Math.min(tierDeductions[severity], SEVERITY_TIER_CAP[severity])
  }

  return { score: clampScore(Math.round(100 - totalDeduction)), findingsCount: findings.length, severityCounts }
}

export type HealthDeductionExplanation = {
  checkKey: string
  severity: Severity
  confidence: Confidence
  scope: FindingScope
  affectedPageCount: number
  occurrenceCount: number
  uniqueTargetCount: number
  spread: number
  rawDeduction: number
}

export type OnPageHealthExplanation = {
  score: number
  startingScore: 100
  deductions: HealthDeductionExplanation[]
  tierDeductions: Record<Severity, number>
  tierCaps: Record<Severity, number>
  totalDeduction: number
}

/**
 * Deterministic backend explainability — reconstructs the exact per-finding
 * deduction breakdown from already-persisted finding fields. No new column
 * needed. A pure function; callers decide how much to surface to a customer
 * versus keep as an internal/support diagnostic (see Part I / Part 9 of
 * this phase's own instructions).
 */
export function explainOnPageHealth(findings: (HealthFindingInput & { checkKey: string })[], totalAnalyzedPages: number): OnPageHealthExplanation {
  const tierDeductions: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  const deductions: HealthDeductionExplanation[] = []

  for (const finding of findings) {
    const spread = finding.scope === 'site' ? 1 : fractionSpread(finding.affectedPageCount, totalAnalyzedPages)
    const rawDeduction = findingDeduction(finding, totalAnalyzedPages)
    tierDeductions[finding.severity] += rawDeduction

    deductions.push({
      checkKey: finding.checkKey,
      severity: finding.severity,
      confidence: finding.confidence,
      scope: finding.scope,
      affectedPageCount: finding.affectedPageCount,
      occurrenceCount: finding.occurrenceCount,
      uniqueTargetCount: finding.uniqueTargetCount ?? 0,
      spread,
      rawDeduction,
    })
  }

  let totalDeduction = 0
  for (const severity of Object.keys(tierDeductions) as Severity[]) {
    totalDeduction += Math.min(tierDeductions[severity], SEVERITY_TIER_CAP[severity])
  }

  return {
    score: clampScore(Math.round(100 - totalDeduction)),
    startingScore: 100,
    deductions,
    tierDeductions,
    tierCaps: SEVERITY_TIER_CAP,
    totalDeduction,
  }
}
