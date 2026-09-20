import type { DimensionResult } from './dimensions'

/**
 * Phase 29 targeted completion pass — CONTENT ANALYSIS COVERAGE.
 *
 * A SEPARATE concept from Content Health (see lib/content/health.ts):
 * Health answers "how many scored problems were found" (100 minus
 * deductions); Coverage answers "how much of the site, and how many of the
 * 12 canonical dimensions, did this analysis actually manage to evaluate
 * with reliable evidence." A perfect Health score of 100 computed from a
 * tiny, low-confidence, mostly-unassessed analysis is not "comprehensively
 * excellent" — it is "nothing scored a problem, on a small amount of
 * genuine evidence." Coverage exists specifically so the UI can make that
 * distinction visible rather than letting a bare number imply more than it
 * verified (this phase's own explicit instruction: "make the relationship
 * between Health and Coverage explicit so a high score cannot visually
 * imply comprehensive assessment when coverage is low").
 *
 * DOCUMENTED, DETERMINISTIC FORMULA — two equally-weighted factors:
 *
 *   extractionRatio  = highConfidenceEligiblePages / eligiblePageCount
 *   dimensionRatio   = dimensionsAssessed / dimensionsTotal (12)
 *   percent          = round(100 * (0.5 * extractionRatio + 0.5 * dimensionRatio))
 *
 * `dimensionsAssessed` counts every dimension whose status is NEITHER
 * 'not_assessed' NOR 'not_applicable' — 'limited_confidence' STILL counts
 * as assessed (a caveated evaluation is a genuine attempt with a real
 * result, unlike an evaluation that never ran at all). AI availability is
 * NOT a separate multiplicative factor: it is already folded into
 * `dimensionRatio` through Content Completeness's own status (it reads
 * 'not_assessed' whenever AI never produced a usable result this run, for
 * any reason — unavailable, no candidates, or nothing notable found), so
 * counting it twice would double-penalize the same underlying fact.
 *
 * CEILING IS EXPECTED, NOT A BUG: three dimensions (Quality & Clarity,
 * Topical Coverage, Content Freshness) are ALWAYS 'not_assessed' in this
 * analyzer version — no current evidence model supports them (see
 * lib/content/dimensions.ts). This means a perfect analysis can reach at
 * most 9/12 dimensions assessed (75%), so even flawless extraction across
 * every page caps around ~88% overall — 'high' is calibrated to be
 * genuinely reachable at that ceiling, not an impossible target.
 */

export type CoverageLevel = 'high' | 'medium' | 'low'

export type ContentAnalysisCoverage = {
  eligiblePageCount: number
  highConfidenceExtractionCount: number
  lowConfidenceExtractionCount: number
  dimensionsAssessed: number
  dimensionsTotal: number
  percent: number
  level: CoverageLevel
}

const HIGH_COVERAGE_THRESHOLD = 70
const MEDIUM_COVERAGE_THRESHOLD = 40

export type ComputeCoverageInput = {
  eligiblePageCount: number
  lowExtractionConfidenceCount: number
  dimensions: Pick<DimensionResult, 'status'>[]
}

export function computeContentAnalysisCoverage(input: ComputeCoverageInput): ContentAnalysisCoverage {
  const { eligiblePageCount, dimensions } = input
  const lowConfidenceExtractionCount = Math.min(input.lowExtractionConfidenceCount, eligiblePageCount)
  const highConfidenceExtractionCount = Math.max(0, eligiblePageCount - lowConfidenceExtractionCount)

  const extractionRatio = eligiblePageCount > 0 ? highConfidenceExtractionCount / eligiblePageCount : 0
  const dimensionsAssessed = dimensions.filter((d) => d.status !== 'not_assessed').length
  const dimensionsTotal = dimensions.length
  const dimensionRatio = dimensionsTotal > 0 ? dimensionsAssessed / dimensionsTotal : 0

  const percent = eligiblePageCount === 0 ? 0 : Math.round(100 * (0.5 * extractionRatio + 0.5 * dimensionRatio))
  const level: CoverageLevel = eligiblePageCount === 0 ? 'low' : percent >= HIGH_COVERAGE_THRESHOLD ? 'high' : percent >= MEDIUM_COVERAGE_THRESHOLD ? 'medium' : 'low'

  return { eligiblePageCount, highConfidenceExtractionCount, lowConfidenceExtractionCount, dimensionsAssessed, dimensionsTotal, percent, level }
}
