import { describe, expect, it } from 'vitest'
import { computeOverallWebsiteHealth } from '@/lib/category-engine/overall-health'
import type { CategorySummary } from '@/lib/category-engine/types'

function summary(overrides: Partial<CategorySummary> = {}): CategorySummary {
  return { categoryKey: 'x', status: 'analyzed', score: 80, findingsCount: 2, partial: false, analyzedAt: '2026-01-01T00:00:00Z', analyzerVersion: 'x-v1', ...overrides }
}

const NOT_ANALYZED: CategorySummary = { categoryKey: 'y', status: 'not_analyzed', score: null, findingsCount: null, partial: false, analyzedAt: null, analyzerVersion: null }

describe('computeOverallWebsiteHealth', () => {
  it('returns null score with zero contributors when no category has been analyzed', () => {
    const result = computeOverallWebsiteHealth([NOT_ANALYZED, NOT_ANALYZED])
    expect(result.score).toBeNull()
    expect(result.contributingCategoryCount).toBe(0)
    expect(result.totalCanonicalCategories).toBe(2)
  })

  it('is the plain unweighted mean of every analyzed category score', () => {
    const result = computeOverallWebsiteHealth([summary({ score: 80 }), summary({ score: 60 }), summary({ score: 100 })])
    expect(result.score).toBe(80)
    expect(result.contributingCategoryCount).toBe(3)
  })

  it('excludes not_analyzed categories from the average entirely — never fabricates 0 or 100 for them', () => {
    const result = computeOverallWebsiteHealth([summary({ score: 80 }), NOT_ANALYZED, NOT_ANALYZED, NOT_ANALYZED])
    expect(result.score).toBe(80) // NOT (80+0+0+0)/4 = 20, and NOT (80+100+100+100)/4 = 95
    expect(result.contributingCategoryCount).toBe(1)
    expect(result.totalCanonicalCategories).toBe(4)
  })

  it('reports how many of the total canonical categories contributed', () => {
    const result = computeOverallWebsiteHealth([summary(), summary(), NOT_ANALYZED, NOT_ANALYZED])
    expect(result.contributingCategoryCount).toBe(2)
    expect(result.totalCanonicalCategories).toBe(4)
  })

  it('rounds the average to the nearest whole number', () => {
    const result = computeOverallWebsiteHealth([summary({ score: 80 }), summary({ score: 81 }), summary({ score: 81 })])
    expect(result.score).toBe(Math.round((80 + 81 + 81) / 3))
  })

  it('is deterministic — identical input always produces identical output', () => {
    const input = [summary({ score: 73 }), summary({ score: 44 }), NOT_ANALYZED]
    const a = computeOverallWebsiteHealth(input)
    const b = computeOverallWebsiteHealth(input)
    expect(a).toEqual(b)
  })

  it('treats a status:"analyzed" summary with a null score the same as not_analyzed (defensive — should never happen in practice, but never divides by a phantom contributor)', () => {
    const malformed: CategorySummary = { ...summary(), score: null }
    const result = computeOverallWebsiteHealth([summary({ score: 80 }), malformed])
    expect(result.score).toBe(80)
    expect(result.contributingCategoryCount).toBe(1)
  })

  it('handles an empty category list without throwing', () => {
    expect(() => computeOverallWebsiteHealth([])).not.toThrow()
    expect(computeOverallWebsiteHealth([]).score).toBeNull()
  })
})
