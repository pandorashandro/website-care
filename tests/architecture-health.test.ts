import { describe, expect, it } from 'vitest'
import { calculateArchitectureHealth, explainArchitectureHealth, type HealthFindingInput } from '@/lib/architecture/health'

function finding(overrides: Partial<HealthFindingInput> = {}): HealthFindingInput {
  const affectedPageCount = overrides.affectedPageCount ?? 0
  return { severity: 'medium', confidence: 'high', scope: 'page', affectedPageCount, occurrenceCount: affectedPageCount, ...overrides }
}

describe('calculateArchitectureHealth', () => {
  it('scores a clean architecture (no findings) as a perfect 100', () => {
    const health = calculateArchitectureHealth([], 20)
    expect(health.score).toBe(100)
    expect(health.findingsCount).toBe(0)
  })

  it('deducts more for a critical finding than a low one', () => {
    const critical = calculateArchitectureHealth([finding({ severity: 'critical', affectedPageCount: 1 })], 20)
    const low = calculateArchitectureHealth([finding({ severity: 'low', affectedPageCount: 1 })], 20)
    expect(critical.score).toBeLessThan(low.score)
  })

  it('a single low-severity finding does not meaningfully destroy an otherwise healthy score', () => {
    const health = calculateArchitectureHealth([finding({ severity: 'low', affectedPageCount: 1 })], 20)
    expect(health.score).toBeGreaterThanOrEqual(95)
  })

  it('is not trivially gamed by many duplicate-style low-severity findings — the tier cap bounds their combined deduction', () => {
    const manyFindings = Array.from({ length: 20 }, () => finding({ severity: 'low', affectedPageCount: 1 }))
    const health = calculateArchitectureHealth(manyFindings, 20)
    expect(health.score).toBeGreaterThan(80)
  })

  it('one genuine critical finding outweighs a long tail of low-severity ones', () => {
    const manyLowFindings = Array.from({ length: 20 }, () => finding({ severity: 'low', affectedPageCount: 1 }))
    const lowOnly = calculateArchitectureHealth(manyLowFindings, 20)
    const withCritical = calculateArchitectureHealth([finding({ severity: 'critical', scope: 'site' })], 20)
    expect(withCritical.score).toBeLessThan(lowOnly.score)
  })

  it('is deterministic — identical input always produces identical output', () => {
    const findings = [finding({ severity: 'high', affectedPageCount: 3 }), finding({ severity: 'medium', affectedPageCount: 1 })]
    const a = calculateArchitectureHealth(findings, 15)
    const b = calculateArchitectureHealth(findings, 15)
    expect(a).toEqual(b)
  })

  it('never returns a score below 0 or above 100', () => {
    const manyFindings = Array.from({ length: 50 }, () => finding({ severity: 'critical', scope: 'site' }))
    const health = calculateArchitectureHealth(manyFindings, 10)
    expect(health.score).toBeGreaterThanOrEqual(0)
    expect(health.score).toBeLessThanOrEqual(100)
  })

  it('counts findings by severity for the summary breakdown', () => {
    const health = calculateArchitectureHealth([finding({ severity: 'critical' }), finding({ severity: 'critical' }), finding({ severity: 'low' })], 10)
    expect(health.severityCounts).toEqual({ critical: 2, high: 0, medium: 0, low: 1 })
  })

  describe('occurrence-aware spread (Phase 27 score-calibration audit correction)', () => {
    it('a single source page with a HUGE occurrence count deducts more than the same finding with a low occurrence count', () => {
      // Same affectedPageCount (1 hub page) on a 30-page site, but 200
      // distinct broken/redirect edges from that one page vs just 1 — the
      // ORIGINAL model (page-fraction-only spread) scored these identically.
      const concentratedButMassive = calculateArchitectureHealth(
        [finding({ severity: 'high', confidence: 'high', affectedPageCount: 1, occurrenceCount: 200 })],
        30
      )
      const trulyMinor = calculateArchitectureHealth([finding({ severity: 'high', confidence: 'high', affectedPageCount: 1, occurrenceCount: 1 })], 30)

      expect(concentratedButMassive.score).toBeLessThan(trulyMinor.score)
    })

    it('does not double-count when a finding is BOTH widespread across pages AND has a high occurrence count (max, not sum)', () => {
      // 20 affected pages AND 20 occurrences on a 30-page site — both
      // signals independently already hit the 1.5x ceiling; the combined
      // spread must still be exactly 1.5x, never stacked higher.
      const explanation = explainArchitectureHealth(
        [{ checkKey: 'internal_link_to_broken_edge', severity: 'high', confidence: 'high', scope: 'page', affectedPageCount: 20, occurrenceCount: 20 }],
        30
      )
      expect(explanation.deductions[0].spread).toBe(1.5)
    })

    it('a low, page-concentrated occurrence count on a large site is not penalized as if it were widespread (site-size normalization)', () => {
      const smallSite = calculateArchitectureHealth([finding({ severity: 'high', confidence: 'high', affectedPageCount: 1, occurrenceCount: 3 })], 10)
      const largeSite = calculateArchitectureHealth([finding({ severity: 'high', confidence: 'high', affectedPageCount: 1, occurrenceCount: 3 })], 500)
      // 3 occurrences is a meaningful fraction of a 10-page site (30%) but
      // negligible on a 500-page site (0.6%) — the large site must not be
      // penalized as heavily for the identical absolute occurrence count.
      expect(largeSite.score).toBeGreaterThan(smallSite.score)
    })

    it('page-level-only findings (occurrenceCount === affectedPageCount) are scored identically to before the correction', () => {
      // orphan/deep/underlinked/dead-end checks have no separate "edge"
      // concept — occurrenceCount always equals affectedPageCount for them
      // — so this correction must be a strict no-op for those checks.
      const health = calculateArchitectureHealth([finding({ severity: 'medium', confidence: 'high', affectedPageCount: 5, occurrenceCount: 5 })], 20)
      expect(health.score).toBe(Math.round(100 - 7 * 1 * 1.25)) // 5/20 = 25% -> 1.25x spread, unchanged formula
    })
  })

  describe('redirect-edge prevalence — Case A/B/C/D (real-world evidence-quality pass, Bespoke 94/100 review)', () => {
    // Mirrors the Bespoke website's actual real-world redirect-edge
    // finding: baseSeverity low, high confidence, an edge-based check.
    function redirectFinding(overrides: Partial<HealthFindingInput> = {}): HealthFindingInput {
      return { severity: 'low', confidence: 'high', scope: 'page', affectedPageCount: 0, occurrenceCount: 0, ...overrides }
    }

    it('Case A (1 low redirect on 1 of 100 pages) deducts far less than Case B (the same pattern on 90 of 100 pages)', () => {
      const caseA = calculateArchitectureHealth([redirectFinding({ affectedPageCount: 1, occurrenceCount: 1 })], 100)
      const caseB = calculateArchitectureHealth([redirectFinding({ affectedPageCount: 90, occurrenceCount: 90 })], 100)
      expect(caseB.score).toBeLessThan(caseA.score)
    })

    it('Case C (hundreds of occurrences from a small set of global nav links) and Case D (an equal number of genuinely independent redirects) deduct IDENTICALLY', () => {
      // Same affectedPageCount/occurrenceCount, only uniqueTargetCount
      // differs (19 shared template targets vs 237 fully independent
      // targets) — the navigation graph carries the same number of
      // unnecessary hops today either way, so intrinsic scoring must not
      // differ based on a template-concentration inference the evidence
      // cannot actually prove.
      const templateAmplified = calculateArchitectureHealth([redirectFinding({ affectedPageCount: 26, occurrenceCount: 237, uniqueTargetCount: 19 })], 30)
      const fullyIndependent = calculateArchitectureHealth([redirectFinding({ affectedPageCount: 26, occurrenceCount: 237, uniqueTargetCount: 237 })], 30)
      expect(templateAmplified.score).toBe(fullyIndependent.score)
    })

    it('reproduces the actual Bespoke 94/100 computation from its two reported real-world findings', () => {
      // Real-world evidence: 30 pages analyzed, a redirect-edge finding
      // (low/high, 26 affected pages, 237 occurrences) and a dead-end
      // finding (low/low, 4 affected pages) — see docs/site-architecture-
      // engine.md §14.6 for the full worked reasoning.
      const health = calculateArchitectureHealth(
        [
          redirectFinding({ affectedPageCount: 26, occurrenceCount: 237, uniqueTargetCount: 19 }),
          { severity: 'low', confidence: 'low', scope: 'page', affectedPageCount: 4, occurrenceCount: 4 },
        ],
        30
      )
      expect(health.score).toBe(94)
    })

    it('hundreds of occurrences from repeated header/footer links cannot destroy the score — capped, not raw-multiplied', () => {
      const extreme = calculateArchitectureHealth([redirectFinding({ affectedPageCount: 30, occurrenceCount: 5000, uniqueTargetCount: 1 })], 30)
      expect(extreme.score).toBeGreaterThanOrEqual(95) // a single low-severity finding can deduct at most 4.5 points
    })

    it('a widespread low-severity redirect problem is still visible in the score, never rounded away to invisible', () => {
      const widespread = calculateArchitectureHealth([redirectFinding({ affectedPageCount: 26, occurrenceCount: 237, uniqueTargetCount: 19 })], 30)
      expect(widespread.score).toBeLessThan(100)
    })
  })
})
