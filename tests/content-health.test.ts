import { describe, expect, it } from 'vitest'
import { calculateContentHealth, explainContentHealth, type HealthFindingInput } from '@/lib/content/health'

function finding(overrides: Partial<HealthFindingInput> = {}): HealthFindingInput {
  const affectedPageCount = overrides.affectedPageCount ?? 0
  return { severity: 'medium', confidence: 'high', scope: 'page', kind: 'problem', affectedPageCount, occurrenceCount: affectedPageCount, ...overrides }
}

describe('calculateContentHealth', () => {
  it('scores a clean analysis (no findings) as a perfect 100', () => {
    const health = calculateContentHealth([], 20)
    expect(health.score).toBe(100)
    expect(health.problemCount).toBe(0)
    expect(health.opportunityCount).toBe(0)
  })

  it('CORE DISTINCTION: an opportunity-kind finding contributes ZERO deduction regardless of severity/confidence', () => {
    const withOpportunity = calculateContentHealth([finding({ kind: 'opportunity', severity: 'critical', confidence: 'high', affectedPageCount: 30 })], 30)
    expect(withOpportunity.score).toBe(100)
    expect(withOpportunity.opportunityCount).toBe(1)
    expect(withOpportunity.problemCount).toBe(0)
  })

  it('a problem-kind finding with identical severity/confidence/prevalence DOES deduct', () => {
    const withProblem = calculateContentHealth([finding({ kind: 'problem', severity: 'critical', confidence: 'high', affectedPageCount: 30, scope: 'site' })], 30)
    expect(withProblem.score).toBeLessThan(100)
  })

  it('mixing problems and opportunities: only the problem contributes to the deduction', () => {
    const health = calculateContentHealth(
      [finding({ kind: 'problem', severity: 'medium', affectedPageCount: 2 }), finding({ kind: 'opportunity', severity: 'critical', affectedPageCount: 30 })],
      30
    )
    const problemOnly = calculateContentHealth([finding({ kind: 'problem', severity: 'medium', affectedPageCount: 2 })], 30)
    expect(health.score).toBe(problemOnly.score)
    expect(health.findingsCount).toBe(2)
    expect(health.problemCount).toBe(1)
    expect(health.opportunityCount).toBe(1)
  })

  it('deducts more for a critical problem than a low one', () => {
    const critical = calculateContentHealth([finding({ severity: 'critical', affectedPageCount: 1 })], 20)
    const low = calculateContentHealth([finding({ severity: 'low', affectedPageCount: 1 })], 20)
    expect(critical.score).toBeLessThan(low.score)
  })

  it('is not trivially gamed by many duplicate-style low-severity problems — the tier cap bounds their combined deduction', () => {
    const manyFindings = Array.from({ length: 20 }, () => finding({ severity: 'low', affectedPageCount: 1 }))
    expect(calculateContentHealth(manyFindings, 20).score).toBeGreaterThan(80)
  })

  it('is deterministic', () => {
    const findings = [finding({ severity: 'high', affectedPageCount: 3 }), finding({ severity: 'medium', affectedPageCount: 1 })]
    expect(calculateContentHealth(findings, 15)).toEqual(calculateContentHealth(findings, 15))
  })

  it('never returns a score below 0 or above 100', () => {
    const manyFindings = Array.from({ length: 50 }, () => finding({ severity: 'critical', scope: 'site' }))
    const health = calculateContentHealth(manyFindings, 10)
    expect(health.score).toBeGreaterThanOrEqual(0)
    expect(health.score).toBeLessThanOrEqual(100)
  })

  it('site-size normalization: the same absolute affected-page count matters less on a larger analyzed population', () => {
    const smallSite = calculateContentHealth([finding({ severity: 'high', affectedPageCount: 5 })], 10)
    const largeSite = calculateContentHealth([finding({ severity: 'high', affectedPageCount: 5 })], 500)
    expect(largeSite.score).toBeGreaterThan(smallSite.score)
  })

  it('duplicate resistance: uniqueTargetCount (duplicate-group count) does not affect the deduction', () => {
    const fewGroups = calculateContentHealth([finding({ severity: 'high', affectedPageCount: 20, uniqueTargetCount: 2 })], 100)
    const manyGroups = calculateContentHealth([finding({ severity: 'high', affectedPageCount: 20, uniqueTargetCount: 20 })], 100)
    expect(fewGroups.score).toBe(manyGroups.score)
  })
})

describe('explainContentHealth', () => {
  it('matches calculateContentHealth\'s own score', () => {
    const findings = [{ checkKey: 'substantively_thin_page', ...finding({ severity: 'high', affectedPageCount: 4 }) }]
    expect(explainContentHealth(findings, 20).score).toBe(calculateContentHealth(findings, 20).score)
  })

  it('reports spread=0 and rawDeduction=0 for an opportunity finding, explaining WHY it contributed nothing', () => {
    const findings = [{ checkKey: 'faq_opportunity', ...finding({ kind: 'opportunity', severity: 'critical', affectedPageCount: 30 }) }]
    const explanation = explainContentHealth(findings, 30)
    expect(explanation.deductions[0]).toMatchObject({ kind: 'opportunity', spread: 0, rawDeduction: 0 })
    expect(explanation.score).toBe(100)
  })

  it('handles empty input', () => {
    const explanation = explainContentHealth([], 20)
    expect(explanation.score).toBe(100)
    expect(explanation.deductions).toEqual([])
  })
})
