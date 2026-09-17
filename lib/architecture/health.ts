import type { Severity, Confidence, FindingScope } from './types'

/**
 * Phase 27, Checkpoint E — Site Architecture health score.
 *
 * CORRECTED in the Phase 27 score-calibration audit (see
 * docs/site-architecture-engine.md's "Score calibration" section and
 * docs/category-score-standard.md). The audit found the ORIGINAL spread
 * calculation — based solely on `affectedPageCount` (distinct SOURCE
 * pages) as a fraction of the analyzed site — was blind to raw occurrence
 * count for edge-based checks (`internal_link_to_redirect_edge`,
 * `internal_link_to_broken_edge`). A single hub page with 1 broken link and
 * a single hub page with 200 broken links produced an IDENTICAL deduction,
 * because both have `affectedPageCount = 1`. This is exactly the "ALSO BAD:
 * one broken link and 100 broken links have almost identical impact"
 * failure mode the audit was tasked with ruling out.
 *
 * THE FIX: `spread` is now the MAX of two independently-normalized
 * signals — the affected-PAGE fraction (unchanged) and the
 * affected-OCCURRENCE fraction (new) — both measured against the same
 * `totalAnalyzedPages` denominator (so a fixed absolute occurrence count
 * is not treated as equally severe on a 10-page site and a 500-page site;
 * see docs/site-architecture-engine.md's site-size-normalization section
 * for the worked comparison). For page-level-only checks (orphan/deep/
 * underlinked/dead-end), `occurrenceCount` always equals `affectedPageCount`
 * by construction (there is no separate "edge" concept), so `spread` is
 * numerically UNCHANGED for those checks — this correction only ever
 * affects the two edge-based checks it was written for.
 *
 * Deduction per finding:
 *
 *   spread     = max(pageFraction(affectedPageCount), pageFraction(occurrenceCount))
 *   deduction  = SEVERITY_DEDUCTION[severity] x CONFIDENCE_MULTIPLIER[confidence] x spread
 *
 * `spread` is always 1 for site-scoped findings (they already represent
 * the whole analyzed site, not a fraction of it).
 *
 * ANTI-GAMING: per-severity-tier caps (unchanged from the original design)
 * still ensure a long tail of low-value findings can never drag the score
 * down as much as one genuine critical problem, and the max-of-two-signals
 * approach (rather than summing them) means an edge problem that is BOTH
 * widespread across pages AND has a huge occurrence count is capped at the
 * same 1.5x ceiling as either alone — occurrence-awareness closes a real
 * blind spot without opening a new "stack multiple spread signals" one.
 *
 * REAL-WORLD EVIDENCE-QUALITY PASS (Bespoke 94/100 review, see
 * docs/site-architecture-engine.md's follow-up section): re-examined
 * whether `uniqueTargetCount` (e.g. "237 occurrences across 26 pages
 * pointing at only 19 distinct redirect targets" — strong evidence of a
 * shared template/navigation link, not 237 independent problems) should
 * ALSO factor into the deduction. It deliberately does not. A concentrated,
 * template-driven redirect chain and an equal number of genuinely
 * independent redirect relationships put the SAME number of unnecessary
 * hops in front of visitors and crawlers today — `uniqueTargetCount` speaks
 * to how CHEAP the fix is (one shared template edit vs many independent
 * edits), not to how degraded the current navigation graph is, and this
 * score measures the latter. Using it to move the deduction would also
 * require guessing at template-recognition this evidence cannot actually
 * support (see redirect-edges.ts and eligibility.ts's own doc comments).
 * `uniqueTargetCount` is instead threaded through purely for
 * explainability (HealthDeductionExplanation, below) so a human or support
 * agent can see the concentration and draw that inference themselves.
 */
const SEVERITY_DEDUCTION: Record<Severity, number> = { critical: 25, high: 15, medium: 7, low: 3 }
const CONFIDENCE_MULTIPLIER: Record<Confidence, number> = { high: 1, medium: 0.7, low: 0.4 }
const SEVERITY_TIER_CAP: Record<Severity, number> = { critical: 100, high: 60, medium: 30, low: 15 }

function pageFractionSpread(count: number, totalAnalyzedPages: number): number {
  if (totalAnalyzedPages <= 0) return 1
  const fraction = count / totalAnalyzedPages
  if (fraction >= 0.5) return 1.5
  if (fraction >= 0.2) return 1.25
  return 1
}

/** See this module's own top-of-file doc comment for why BOTH signals are computed and the max (not sum) is taken. */
function combinedSpread(affectedPageCount: number, occurrenceCount: number, totalAnalyzedPages: number): number {
  return Math.max(pageFractionSpread(affectedPageCount, totalAnalyzedPages), pageFractionSpread(occurrenceCount, totalAnalyzedPages))
}

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, score))
}

export type HealthFindingInput = {
  checkKey?: string
  severity: Severity
  confidence: Confidence
  scope: FindingScope
  affectedPageCount: number
  /** Total distinct problem instances (edges) backing this finding — equal to affectedPageCount for page-level-only checks (orphan/deep/underlinked/dead-end), and potentially larger for edge-based checks (one source page can have multiple distinct broken/redirected targets). */
  occurrenceCount: number
  /** Distinct target/resource URLs this finding's occurrences point at — 0 for page-level-only checks with no separate target concept. Never affects the deduction math (see this module's own doc comment); carried through purely so explainArchitectureHealth can reconstruct a full evidence breakdown (Part I). */
  uniqueTargetCount?: number
}

export type ArchitectureHealth = {
  score: number
  findingsCount: number
  severityCounts: Record<Severity, number>
}

function findingDeduction(finding: HealthFindingInput, totalAnalyzedPages: number): number {
  const spread = finding.scope === 'site' ? 1 : combinedSpread(finding.affectedPageCount, finding.occurrenceCount, totalAnalyzedPages)
  return SEVERITY_DEDUCTION[finding.severity] * CONFIDENCE_MULTIPLIER[finding.confidence] * spread
}

export function calculateArchitectureHealth(findings: HealthFindingInput[], totalAnalyzedPages: number): ArchitectureHealth {
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

  return {
    score: clampScore(Math.round(100 - totalDeduction)),
    findingsCount: findings.length,
    severityCounts,
  }
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

export type ArchitectureHealthExplanation = {
  score: number
  startingScore: 100
  deductions: HealthDeductionExplanation[]
  tierDeductions: Record<Severity, number>
  tierCaps: Record<Severity, number>
  totalDeduction: number
}

/**
 * Phase 27 score-calibration audit, Step 9 — deterministic backend
 * explainability. Reconstructs the exact per-finding deduction breakdown
 * from already-persisted data (technical_findings-shaped rows carry
 * severity/confidence/affected_page_count/occurrence_count verbatim — no
 * new column was needed). A pure function, not a UI concern: callers
 * decide how much of this to surface to a customer versus keep as an
 * internal/support diagnostic.
 */
export function explainArchitectureHealth(findings: (HealthFindingInput & { checkKey: string })[], totalAnalyzedPages: number): ArchitectureHealthExplanation {
  const tierDeductions: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  const deductions: HealthDeductionExplanation[] = []

  for (const finding of findings) {
    const spread = finding.scope === 'site' ? 1 : combinedSpread(finding.affectedPageCount, finding.occurrenceCount, totalAnalyzedPages)
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
