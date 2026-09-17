import { describe, expect, it } from 'vitest'
import { calculateOnPageHealth, explainOnPageHealth, type HealthFindingInput } from '@/lib/on-page/health'

function finding(overrides: Partial<HealthFindingInput> = {}): HealthFindingInput {
  const affectedPageCount = overrides.affectedPageCount ?? 0
  return { severity: 'medium', confidence: 'high', scope: 'page', affectedPageCount, occurrenceCount: affectedPageCount, ...overrides }
}

describe('calculateOnPageHealth', () => {
  it('scores a clean analysis (no findings) as a perfect 100', () => {
    expect(calculateOnPageHealth([], 20).score).toBe(100)
  })

  it('deducts more for a critical finding than a low one', () => {
    const critical = calculateOnPageHealth([finding({ severity: 'critical', affectedPageCount: 1 })], 20)
    const low = calculateOnPageHealth([finding({ severity: 'low', affectedPageCount: 1 })], 20)
    expect(critical.score).toBeLessThan(low.score)
  })

  it('a single low-severity finding does not meaningfully destroy an otherwise healthy score', () => {
    expect(calculateOnPageHealth([finding({ severity: 'low', affectedPageCount: 1 })], 20).score).toBeGreaterThanOrEqual(95)
  })

  it('is not trivially gamed by many duplicate-style low-severity findings — the tier cap bounds their combined deduction', () => {
    const manyFindings = Array.from({ length: 20 }, () => finding({ severity: 'low', affectedPageCount: 1 }))
    expect(calculateOnPageHealth(manyFindings, 20).score).toBeGreaterThan(80)
  })

  it('one genuine critical finding outweighs a long tail of low-severity ones', () => {
    const manyLowFindings = Array.from({ length: 20 }, () => finding({ severity: 'low', affectedPageCount: 1 }))
    const lowOnly = calculateOnPageHealth(manyLowFindings, 20)
    const withCritical = calculateOnPageHealth([finding({ severity: 'critical', scope: 'site' })], 20)
    expect(withCritical.score).toBeLessThan(lowOnly.score)
  })

  it('is deterministic', () => {
    const findings = [finding({ severity: 'high', affectedPageCount: 3 }), finding({ severity: 'medium', affectedPageCount: 1 })]
    expect(calculateOnPageHealth(findings, 15)).toEqual(calculateOnPageHealth(findings, 15))
  })

  it('never returns a score below 0 or above 100', () => {
    const manyFindings = Array.from({ length: 50 }, () => finding({ severity: 'critical', scope: 'site' }))
    const health = calculateOnPageHealth(manyFindings, 10)
    expect(health.score).toBeGreaterThanOrEqual(0)
    expect(health.score).toBeLessThanOrEqual(100)
  })

  it('site-size normalization: the same absolute affected-page count matters less on a larger analyzed population', () => {
    const smallSite = calculateOnPageHealth([finding({ severity: 'high', affectedPageCount: 5 })], 10) // 50%
    const largeSite = calculateOnPageHealth([finding({ severity: 'high', affectedPageCount: 5 })], 500) // 1%
    expect(largeSite.score).toBeGreaterThan(smallSite.score)
  })

  it('a widespread duplicate-title-style finding (many affected pages) deducts more than a narrow one of the same severity', () => {
    const narrow = calculateOnPageHealth([finding({ severity: 'high', affectedPageCount: 2 })], 100) // 2%
    const widespread = calculateOnPageHealth([finding({ severity: 'high', affectedPageCount: 90 })], 100) // 90%
    expect(widespread.score).toBeLessThan(narrow.score)
  })

  it('uniqueTargetCount (duplicate-group count) does not affect the deduction — only affectedPageCount does', () => {
    const fewGroups = calculateOnPageHealth([finding({ severity: 'high', affectedPageCount: 20, uniqueTargetCount: 2 })], 100)
    const manyGroups = calculateOnPageHealth([finding({ severity: 'high', affectedPageCount: 20, uniqueTargetCount: 20 })], 100)
    expect(fewGroups.score).toBe(manyGroups.score)
  })
})

describe('explainOnPageHealth', () => {
  it('matches calculateOnPageHealth\'s own score', () => {
    const findings = [{ checkKey: 'missing_title', ...finding({ severity: 'high', affectedPageCount: 4 }) }]
    expect(explainOnPageHealth(findings, 20).score).toBe(calculateOnPageHealth(findings, 20).score)
  })

  it('reports affectedPageCount/occurrenceCount/uniqueTargetCount per deduction', () => {
    const findings = [{ checkKey: 'duplicate_title', ...finding({ severity: 'high', affectedPageCount: 6, occurrenceCount: 6, uniqueTargetCount: 2 }) }]
    const explanation = explainOnPageHealth(findings, 20)
    expect(explanation.deductions[0]).toMatchObject({ checkKey: 'duplicate_title', affectedPageCount: 6, occurrenceCount: 6, uniqueTargetCount: 2 })
  })

  it('handles empty input', () => {
    const explanation = explainOnPageHealth([], 20)
    expect(explanation.score).toBe(100)
    expect(explanation.deductions).toEqual([])
  })
})

describe('score reconstruction — Bespoke real-world evidence validation (30/100, 57 result)', () => {
  /**
   * Reproduces the exact real-world finding shape reported for Bespoke
   * (30 pages analyzed; 1 High/2 Medium/1 Low severity finding; duplicate_title
   * 12/30, missing_meta_description 30/30, missing_h1 30/30) to prove the
   * persisted score of 57 is a deterministic, capped-correctly consequence
   * of the documented formula — not an unexplained or arbitrary number.
   *
   * The real-world report did not disclose the 4th (Low-severity) finding's
   * checkKey/affected-page-count (On-Page SEO's summary metrics tile does
   * not surface every possible check, only the five highlighted ones), so
   * this test demonstrates ONE concrete, internally-consistent
   * reconstruction that reaches exactly 57 — a small, narrow-scope Low
   * finding (affecting under 20% of analyzed pages, so spread stays at its
   * floor of 1x) is sufficient. This proves the SCORE ITSELF is fully
   * explainable by the formula; identifying the EXACT 4th finding requires
   * inspecting the live analysis, not something this repository can invent.
   */
  it('reconstructs 57 from the documented high/medium findings plus one small low-severity finding', () => {
    const totalAnalyzedPages = 30

    const duplicateTitle: HealthFindingInput = { severity: 'high', confidence: 'high', scope: 'page', affectedPageCount: 12, occurrenceCount: 12 }
    const missingMeta: HealthFindingInput = { severity: 'medium', confidence: 'high', scope: 'page', affectedPageCount: 30, occurrenceCount: 30 }
    const missingH1: HealthFindingInput = { severity: 'medium', confidence: 'high', scope: 'page', affectedPageCount: 30, occurrenceCount: 30 }
    // A plausible 4th finding: low severity, high confidence, affecting only
    // 1 of 30 pages (well under the 20% spread breakpoint, so spread = 1x).
    const smallLowFinding: HealthFindingInput = { severity: 'low', confidence: 'high', scope: 'page', affectedPageCount: 1, occurrenceCount: 1 }

    const health = calculateOnPageHealth([duplicateTitle, missingMeta, missingH1, smallLowFinding], totalAnalyzedPages)

    expect(health.score).toBe(57)
    expect(health.severityCounts).toEqual({ critical: 0, high: 1, medium: 2, low: 1 })
  })

  it('shows the exact per-finding deduction breakdown summing to the 42.75-point total that rounds to 57', () => {
    const totalAnalyzedPages = 30
    const findings = [
      { checkKey: 'duplicate_title', severity: 'high' as const, confidence: 'high' as const, scope: 'page' as const, affectedPageCount: 12, occurrenceCount: 12 },
      { checkKey: 'missing_meta_description', severity: 'medium' as const, confidence: 'high' as const, scope: 'page' as const, affectedPageCount: 30, occurrenceCount: 30 },
      { checkKey: 'missing_h1', severity: 'medium' as const, confidence: 'high' as const, scope: 'page' as const, affectedPageCount: 30, occurrenceCount: 30 },
      { checkKey: 'title_too_long', severity: 'low' as const, confidence: 'high' as const, scope: 'page' as const, affectedPageCount: 1, occurrenceCount: 1 },
    ]

    const explanation = explainOnPageHealth(findings, totalAnalyzedPages)

    // duplicate_title: 12/30 = 40% -> 1.25x spread -> 15 * 1 * 1.25 = 18.75
    expect(explanation.deductions[0]).toMatchObject({ checkKey: 'duplicate_title', spread: 1.25, rawDeduction: 18.75 })
    // missing_meta_description: 30/30 = 100% -> 1.5x spread -> 7 * 1 * 1.5 = 10.5
    expect(explanation.deductions[1]).toMatchObject({ checkKey: 'missing_meta_description', spread: 1.5, rawDeduction: 10.5 })
    // missing_h1: 30/30 = 100% -> 1.5x spread -> 7 * 1 * 1.5 = 10.5
    expect(explanation.deductions[2]).toMatchObject({ checkKey: 'missing_h1', spread: 1.5, rawDeduction: 10.5 })
    // title_too_long: 1/30 = 3.3% -> 1x spread -> 3 * 1 * 1 = 3
    expect(explanation.deductions[3]).toMatchObject({ checkKey: 'title_too_long', spread: 1, rawDeduction: 3 })

    expect(explanation.totalDeduction).toBeCloseTo(42.75, 5)
    // No severity tier cap engages here (high tier: 18.75 << 60 cap; medium
    // tier: 21 << 30 cap; low tier: 3 << 15 cap) -- the deduction is a plain
    // sum, and only the FINAL score is rounded once: 100 - 42.75 = 57.25 -> 57.
    expect(explanation.score).toBe(57)
  })
})
