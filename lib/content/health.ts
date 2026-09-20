import type { Severity, Confidence, FindingScope, FindingKind } from './types'
import { SEVERITY_DEDUCTION, CONFIDENCE_MULTIPLIER, SEVERITY_TIER_CAP, fractionSpread, clampScore } from '@/lib/category-engine/health'

/**
 * Phase 29 — Content Intelligence health score. Built on the shared
 * lib/category-engine/health.ts primitives (see that module's own doc
 * comment for the shared-formula precedent).
 *
 * THE CORE PRODUCT DISTINCTION THIS MODULE IMPLEMENTS — HEALTH vs
 * OPPORTUNITY: a finding's `kind` is either 'problem' (evidence-backed
 * content-quality degradation) or 'opportunity' (a suggested improvement to
 * already-valid content). ONLY 'problem' findings ever enter the deduction
 * sum below — an 'opportunity' finding (e.g. faq_opportunity) is fully
 * persisted, displayed, and sortable, but contributes ZERO to the score,
 * regardless of its own severity/confidence fields. This is not a special
 * case bolted onto the formula; it is the FIRST thing `findingDeduction`
 * checks, per this phase's own explicit instruction: "Do not punish a
 * healthy page because AI found an optional idea" (equally true for a
 * deterministic opportunity, not just an AI one).
 *
 * Deduction per PROBLEM finding:
 *
 *   spread     = fractionSpread(affectedPageCount, totalAnalyzedPages)
 *   deduction  = SEVERITY_DEDUCTION[severity] x CONFIDENCE_MULTIPLIER[confidence] x spread
 *
 * Identical shape to On-Page SEO's own health.ts — every Content V1 check
 * has exactly one evidence instance per affected page by construction (see
 * each check's own doc comment), so occurrenceCount === affectedPageCount
 * always holds today and spread uses affectedPageCount directly (no
 * occurrence-aware max() the way Site Architecture's edge-based checks
 * need). `occurrenceCount`/`uniqueTargetCount` are still carried for schema
 * consistency and explainability, exactly as On-Page SEO's health.ts
 * documents for its own duplicate-group checks.
 *
 * ANTI-GAMING: per-severity-tier caps (identical constants to every other
 * engine) ensure a long tail of low-value PROBLEM findings can never drag
 * the score down as much as one genuine high/critical problem. AI output
 * (when eventually added) cannot arbitrarily destroy a website's score
 * for two independent reasons: (1) low-confidence findings are already
 * softened by CONFIDENCE_MULTIPLIER, and (2) an 'opportunity'-kind finding
 * — the classification this phase expects most AI-derived suggestions to
 * use (see docs/content-intelligence-engine.md's "Health vs Opportunity"
 * section) — cannot affect the score at all, by construction, regardless
 * of what an AI call returns.
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

export type ContentHealth = { score: number; findingsCount: number; problemCount: number; opportunityCount: number; severityCounts: Record<Severity, number> }

function findingDeduction(finding: HealthFindingInput, totalAnalyzedPages: number): number {
  if (finding.kind === 'opportunity') return 0

  const spread = finding.scope === 'site' ? 1 : fractionSpread(finding.affectedPageCount, totalAnalyzedPages)
  return SEVERITY_DEDUCTION[finding.severity] * CONFIDENCE_MULTIPLIER[finding.confidence] * spread
}

export function calculateContentHealth(findings: HealthFindingInput[], totalAnalyzedPages: number): ContentHealth {
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

export type HealthDeductionExplanation = {
  checkKey: string
  severity: Severity
  confidence: Confidence
  scope: FindingScope
  kind: FindingKind
  affectedPageCount: number
  occurrenceCount: number
  uniqueTargetCount: number
  spread: number
  rawDeduction: number
}

export type ContentHealthExplanation = {
  score: number
  startingScore: 100
  deductions: HealthDeductionExplanation[]
  tierDeductions: Record<Severity, number>
  tierCaps: Record<Severity, number>
  totalDeduction: number
}

/**
 * Deterministic backend explainability — reconstructs the exact per-finding
 * deduction breakdown (including WHY an opportunity contributed 0) from
 * already-persisted finding fields. No new column needed.
 */
export function explainContentHealth(findings: (HealthFindingInput & { checkKey: string })[], totalAnalyzedPages: number): ContentHealthExplanation {
  const tierDeductions: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  const deductions: HealthDeductionExplanation[] = []

  for (const finding of findings) {
    const spread = finding.kind === 'opportunity' ? 0 : finding.scope === 'site' ? 1 : fractionSpread(finding.affectedPageCount, totalAnalyzedPages)
    const rawDeduction = findingDeduction(finding, totalAnalyzedPages)
    tierDeductions[finding.severity] += rawDeduction

    deductions.push({
      checkKey: finding.checkKey,
      severity: finding.severity,
      confidence: finding.confidence,
      scope: finding.scope,
      kind: finding.kind,
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
