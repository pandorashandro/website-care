import { describe, expect, it } from 'vitest'
import { calculateTechnicalSeoHealth, type HealthFindingInput } from '@/lib/technical-seo/health'

function finding(overrides: Partial<HealthFindingInput> = {}): HealthFindingInput {
  return {
    severity: 'medium',
    confidence: 'high',
    scope: 'page',
    affectedPageCount: 0,
    ...overrides,
  }
}

describe('calculateTechnicalSeoHealth', () => {
  it('scores a clean crawl (no findings) as a perfect 100', () => {
    const health = calculateTechnicalSeoHealth([], 20)
    expect(health.score).toBe(100)
    expect(health.findingsCount).toBe(0)
  })

  it('deducts more for a critical finding than a low one, all else equal', () => {
    const criticalHealth = calculateTechnicalSeoHealth([finding({ severity: 'critical', affectedPageCount: 1 })], 20)
    const lowHealth = calculateTechnicalSeoHealth([finding({ severity: 'low', affectedPageCount: 1 })], 20)
    expect(criticalHealth.score).toBeLessThan(lowHealth.score)
  })

  it('deducts less for a low-confidence finding than the same finding at high confidence', () => {
    const highConfidence = calculateTechnicalSeoHealth([finding({ confidence: 'high', affectedPageCount: 1 })], 20)
    const lowConfidence = calculateTechnicalSeoHealth([finding({ confidence: 'low', affectedPageCount: 1 })], 20)
    expect(lowConfidence.score).toBeGreaterThan(highConfidence.score)
  })

  it('deducts more when a finding affects a larger fraction of the analyzed pages', () => {
    const narrow = calculateTechnicalSeoHealth([finding({ severity: 'high', affectedPageCount: 1 })], 20)
    const widespread = calculateTechnicalSeoHealth([finding({ severity: 'high', affectedPageCount: 15 })], 20)
    expect(widespread.score).toBeLessThan(narrow.score)
  })

  it('a site-scoped finding is not further multiplied by a page-count spread factor', () => {
    // A site-scoped finding already represents the whole site by definition
    // — it should deduct the same regardless of totalAnalyzedPages.
    const small = calculateTechnicalSeoHealth([finding({ scope: 'site', severity: 'high' })], 5)
    const large = calculateTechnicalSeoHealth([finding({ scope: 'site', severity: 'high' })], 500)
    expect(small.score).toBe(large.score)
  })

  it('is not trivially gamed by many low-severity findings — the tier cap bounds their combined deduction', () => {
    const manyLowFindings = Array.from({ length: 20 }, () => finding({ severity: 'low', affectedPageCount: 1 }))
    const health = calculateTechnicalSeoHealth(manyLowFindings, 20)
    // 20 independent 'low' findings would be 20 x 3 = 60 points uncapped —
    // the cap must keep the actual deduction well under that.
    expect(health.score).toBeGreaterThan(80)
  })

  it('one genuine critical finding outweighs a long tail of low-severity ones', () => {
    const manyLowFindings = Array.from({ length: 20 }, () => finding({ severity: 'low', affectedPageCount: 1 }))
    const lowOnlyHealth = calculateTechnicalSeoHealth(manyLowFindings, 20)
    const criticalHealth = calculateTechnicalSeoHealth([finding({ severity: 'critical', scope: 'site' })], 20)
    expect(criticalHealth.score).toBeLessThan(lowOnlyHealth.score)
  })

  it('counts findings by severity for the summary breakdown', () => {
    const health = calculateTechnicalSeoHealth([finding({ severity: 'critical' }), finding({ severity: 'critical' }), finding({ severity: 'low' })], 10)
    expect(health.severityCounts).toEqual({ critical: 2, high: 0, medium: 0, low: 1 })
  })

  it('never returns a score below 0 or above 100', () => {
    const manyFindings = Array.from({ length: 50 }, () => finding({ severity: 'critical', scope: 'site' }))
    const health = calculateTechnicalSeoHealth(manyFindings, 10)
    expect(health.score).toBeGreaterThanOrEqual(0)
    expect(health.score).toBeLessThanOrEqual(100)
  })
})
