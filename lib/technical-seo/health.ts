import type { Severity, Confidence, FindingScope } from './types'

/**
 * A structural subset of AggregatedFinding (or an already-persisted
 * technical_findings DB row, which carries affected_page_count directly) —
 * decoupled from the full shape so this function can be called both right
 * after aggregation (in-memory findings) and later when simply re-reading
 * already-persisted findings for display, without re-fetching every
 * affected-page row just to count them.
 */
export type HealthFindingInput = {
  severity: Severity
  confidence: Confidence
  scope: FindingScope
  affectedPageCount: number
}

/**
 * Phase 26, Checkpoint 11 — Technical SEO health score.
 *
 * A fresh, category-scoped score (not a modification of
 * lib/scanner/calculate-health-score.ts's overall website score, which
 * remains the legacy scanner's own model) — kept as its own small module so
 * a future overall Website Health score (Technical + On-Page + Content +
 * Architecture + Performance + Security + Accessibility, per this phase's
 * own "preserve future ability" instruction) has one clearly-scoped number
 * to combine, without this phase needing to guess at how that combination
 * will eventually work.
 *
 * Deduction model, per finding:
 *
 *   deduction = SEVERITY_DEDUCTION[severity] x CONFIDENCE_MULTIPLIER[confidence] x spread
 *
 * - SEVERITY_DEDUCTION reflects how consequential the condition is.
 * - CONFIDENCE_MULTIPLIER softens the impact of anything webioom is not
 *   fully sure about — a 'low' confidence finding can never cost as much as
 *   the same condition observed with 'high' confidence.
 * - `spread` (page-scoped findings only) scales the deduction by how much
 *   of the ANALYZED site is affected, not by absolute page count — the same
 *   percentage means the same thing whether the crawl covered 30 pages
 *   (Free) or 500 (Bloom Pro). Site-scoped findings (scope: 'site') have no
 *   separate page-count multiplier — they already represent the whole
 *   site, not a fraction of it, by definition.
 *
 * ANTI-GAMING: per-severity-tier caps ensure a long tail of low-value
 * findings can never drag the score down as much as a single serious one —
 * adding another 'low' check to the library, or having many minor
 * conditions fire at once on a real site, cannot out-weigh one genuine
 * 'critical' problem. This is the direct answer to "should not be trivially
 * gamed by adding many low-value checks."
 */
const SEVERITY_DEDUCTION: Record<Severity, number> = { critical: 25, high: 15, medium: 7, low: 3 }
const CONFIDENCE_MULTIPLIER: Record<Confidence, number> = { high: 1, medium: 0.7, low: 0.4 }
const SEVERITY_TIER_CAP: Record<Severity, number> = { critical: 100, high: 60, medium: 30, low: 15 }

function spreadMultiplier(affectedPageCount: number, totalAnalyzedPages: number): number {
  if (totalAnalyzedPages <= 0) return 1
  const fraction = affectedPageCount / totalAnalyzedPages
  if (fraction >= 0.5) return 1.5
  if (fraction >= 0.2) return 1.25
  return 1
}

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, score))
}

export type TechnicalSeoHealth = {
  score: number
  findingsCount: number
  severityCounts: Record<Severity, number>
}

export function calculateTechnicalSeoHealth(findings: HealthFindingInput[], totalAnalyzedPages: number): TechnicalSeoHealth {
  const tierDeductions: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  const severityCounts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }

  for (const finding of findings) {
    severityCounts[finding.severity]++

    const spread = finding.scope === 'site' ? 1 : spreadMultiplier(finding.affectedPageCount, totalAnalyzedPages)
    const deduction = SEVERITY_DEDUCTION[finding.severity] * CONFIDENCE_MULTIPLIER[finding.confidence] * spread

    tierDeductions[finding.severity] += deduction
  }

  let totalDeduction = 0
  for (const severity of Object.keys(tierDeductions) as Severity[]) {
    totalDeduction += Math.min(tierDeductions[severity], SEVERITY_TIER_CAP[severity])
  }

  return {
    score: clampScore(Math.round(100 - totalDeduction)),
    findingsCount: findings.length,
    severityCounts,
  }
}
