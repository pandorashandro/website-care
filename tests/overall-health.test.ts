import { describe, expect, it } from 'vitest'
import { computeOverallWebsiteHealth } from '@/lib/category-engine/overall-health'
import type { CategorySummary } from '@/lib/category-engine/types'

/**
 * Scoring Engine V1 contract (2026-09-24, see docs/scoring-contract-v1.md):
 * `summary()`'s default now includes `coverage: 'adequate'` — a category
 * summary that is `analyzed` but silent on coverage is exactly the
 * "unknown confidence" case the contract treats as NOT sufficient (see
 * lib/category-engine/types.ts's own doc comment: a missing coverage value
 * is never a green light) — tests that want to exercise the "withheld"
 * path override `coverage` explicitly, exactly like they already override
 * `status`/`score` for the not_analyzed case.
 */
function summary(overrides: Partial<CategorySummary> = {}): CategorySummary {
  return { categoryKey: 'x', status: 'analyzed', score: 80, findingsCount: 2, partial: false, analyzedAt: '2026-01-01T00:00:00Z', analyzerVersion: 'x-v1', coverage: 'adequate', ...overrides }
}

const NOT_ANALYZED: CategorySummary = { categoryKey: 'y', status: 'not_analyzed', score: null, findingsCount: null, partial: false, analyzedAt: null, analyzerVersion: null }

describe('computeOverallWebsiteHealth — WITHHELD (score: null) cases', () => {
  it('returns null score with zero contributors when no category has been analyzed', () => {
    const result = computeOverallWebsiteHealth([NOT_ANALYZED, NOT_ANALYZED])
    expect(result.score).toBeNull()
    expect(result.contributingCategoryCount).toBe(0)
    expect(result.totalCanonicalCategories).toBe(2)
  })

  it('REGRESSION — a fully blocked crawl (every pillar not_analyzed) withholds Overall Website Health, never a fabricated score anchored on nothing', () => {
    const allSeven = Array.from({ length: 7 }, (_, i) => ({ ...NOT_ANALYZED, categoryKey: `pillar-${i}` }))
    const result = computeOverallWebsiteHealth(allSeven)
    expect(result.score).toBeNull()
    expect(result.contributingCategoryCount).toBe(0)
    expect(result.totalCanonicalCategories).toBe(7)
  })

  it('REGRESSION — the exact reported failure shape: 4 of 7 pillars genuinely analyzed (Technical SEO=95, On-Page=92, Accessibility=94, Security=96) with the other 3 not_analyzed is WITHHELD, not presented as a plain ~94', () => {
    const technicalSeo = summary({ categoryKey: 'technical_seo', score: 95 })
    const onPageSeo = summary({ categoryKey: 'on_page_seo', score: 92 })
    const accessibility = summary({ categoryKey: 'accessibility', score: 94 })
    const security = summary({ categoryKey: 'security', score: 96 })
    const siteArchitecture = { ...NOT_ANALYZED, categoryKey: 'site_architecture' }
    const content = { ...NOT_ANALYZED, categoryKey: 'content' }
    const performance = { ...NOT_ANALYZED, categoryKey: 'performance' }

    const result = computeOverallWebsiteHealth([technicalSeo, onPageSeo, siteArchitecture, content, performance, accessibility, security])
    expect(result.score).toBeNull()
    expect(result.contributingCategoryCount).toBe(4)
    expect(result.totalCanonicalCategories).toBe(7)
  })

  it('withholds the score when all seven are "analyzed" but even ONE has thin (\'low\') coverage — a complete-looking status set is not the same as complete evidence', () => {
    const sixAdequate = Array.from({ length: 6 }, (_, i) => summary({ categoryKey: `pillar-${i}` }))
    const oneThin = summary({ categoryKey: 'pillar-6', coverage: 'low' })
    const result = computeOverallWebsiteHealth([...sixAdequate, oneThin])
    expect(result.score).toBeNull()
    expect(result.contributingCategoryCount).toBe(7) // all 7 have a numeric score...
    expect(result.totalCanonicalCategories).toBe(7) // ...but that alone does not earn a displayed Overall Score
  })

  it('withholds the score when a coverage value is missing/null entirely — never silently treated as adequate', () => {
    const sixAdequate = Array.from({ length: 6 }, (_, i) => summary({ categoryKey: `pillar-${i}` }))
    const legacyRow = summary({ categoryKey: 'pillar-6', coverage: null })
    const result = computeOverallWebsiteHealth([...sixAdequate, legacyRow])
    expect(result.score).toBeNull()
  })

  it('treats a status:"analyzed" summary with a null score the same as not_analyzed — never divides by a phantom contributor', () => {
    const malformed: CategorySummary = { ...summary(), score: null }
    const result = computeOverallWebsiteHealth([summary(), malformed])
    expect(result.score).toBeNull()
    expect(result.contributingCategoryCount).toBe(1)
  })

  it('handles an empty category list without throwing', () => {
    expect(() => computeOverallWebsiteHealth([])).not.toThrow()
    expect(computeOverallWebsiteHealth([]).score).toBeNull()
  })
})

describe('computeOverallWebsiteHealth — COMPLETE (exact seven-pillar arithmetic mean) cases', () => {
  it('is the plain unweighted mean of every analyzed category score when ALL are analyzed with adequate coverage', () => {
    const result = computeOverallWebsiteHealth([summary({ score: 80 }), summary({ score: 60 }), summary({ score: 100 })])
    expect(result.score).toBe(80)
    expect(result.contributingCategoryCount).toBe(3)
  })

  it('rounds the average to the nearest whole number', () => {
    const result = computeOverallWebsiteHealth([summary({ score: 80 }), summary({ score: 81 }), summary({ score: 81 })])
    expect(result.score).toBe(Math.round((80 + 81 + 81) / 3))
  })

  it('is deterministic — identical input always produces identical output', () => {
    const input = [summary({ score: 73 }), summary({ score: 44 }), summary({ score: 91 })]
    const a = computeOverallWebsiteHealth(input)
    const b = computeOverallWebsiteHealth(input)
    expect(a).toEqual(b)
  })

  it('the exact seven-pillar formula: round(sum(seven scores) / 7) when all seven are adequate', () => {
    const scores = [95, 88, 100, 72, 91, 84, 77]
    const summaries = scores.map((score, i) => summary({ categoryKey: `pillar-${i}`, score }))
    const result = computeOverallWebsiteHealth(summaries)
    const expected = Math.round(scores.reduce((sum, s) => sum + s, 0) / 7)
    expect(result.score).toBe(expected)
    expect(result.contributingCategoryCount).toBe(7)
    expect(result.totalCanonicalCategories).toBe(7)
  })
})
