import { describe, expect, it } from 'vitest'
import { computeContentAnalysisCoverage } from '@/lib/content/coverage'
import type { DimensionStatus } from '@/lib/content/dimensions'

function dims(...statuses: DimensionStatus[]) {
  return statuses.map((status) => ({ status }))
}

describe('computeContentAnalysisCoverage', () => {
  it('is 0% / "low" when there are zero eligible pages — no fake coverage on nothing analyzed', () => {
    const result = computeContentAnalysisCoverage({ eligiblePageCount: 0, lowExtractionConfidenceCount: 0, dimensions: dims('not_assessed', 'not_assessed') })
    expect(result.percent).toBe(0)
    expect(result.level).toBe('low')
  })

  it('is "high" when extraction is fully reliable and most dimensions are assessed', () => {
    // 9 assessed / 12 total is the realistic ceiling (3 dimensions are always not_assessed this analyzer version).
    const dimensions = dims('healthy', 'healthy', 'healthy', 'findings', 'opportunities', 'limited_confidence', 'healthy', 'healthy', 'healthy', 'not_assessed', 'not_assessed', 'not_assessed')
    const result = computeContentAnalysisCoverage({ eligiblePageCount: 30, lowExtractionConfidenceCount: 0, dimensions })
    expect(result.level).toBe('high')
  })

  it('is pulled down to at most "medium" when extraction confidence is poor across most pages, even with every reachable dimension assessed — one bad factor cannot be fully offset by the other', () => {
    const dimensions = dims('healthy', 'healthy', 'healthy', 'healthy', 'healthy', 'healthy', 'healthy', 'healthy', 'healthy', 'not_assessed', 'not_assessed', 'not_assessed')
    const result = computeContentAnalysisCoverage({ eligiblePageCount: 30, lowExtractionConfidenceCount: 27, dimensions })
    expect(result.level).not.toBe('high')
  })

  it('is pulled down to at most "medium" when almost every dimension is not_assessed, even with perfect extraction confidence — one bad factor cannot be fully offset by the other', () => {
    const dimensions = dims('not_assessed', 'not_assessed', 'not_assessed', 'not_assessed', 'not_assessed', 'not_assessed', 'not_assessed', 'not_assessed', 'not_assessed', 'not_assessed', 'not_assessed', 'healthy')
    const result = computeContentAnalysisCoverage({ eligiblePageCount: 30, lowExtractionConfidenceCount: 0, dimensions })
    expect(result.level).not.toBe('high')
  })

  it('is "low" when BOTH extraction confidence and dimension coverage are poor', () => {
    const dimensions = dims('not_assessed', 'not_assessed', 'not_assessed', 'not_assessed', 'not_assessed', 'not_assessed', 'not_assessed', 'not_assessed', 'not_assessed', 'not_assessed', 'not_assessed', 'healthy')
    const result = computeContentAnalysisCoverage({ eligiblePageCount: 30, lowExtractionConfidenceCount: 27, dimensions })
    expect(result.level).toBe('low')
  })

  it('counts "limited_confidence" as assessed — a caveated evaluation is still a genuine attempt, not an absence of one', () => {
    const highDims = dims('healthy', 'healthy', 'healthy', 'healthy', 'healthy', 'healthy', 'healthy', 'healthy', 'healthy', 'not_assessed', 'not_assessed', 'not_assessed')
    const limitedDims = dims('limited_confidence', 'limited_confidence', 'limited_confidence', 'limited_confidence', 'limited_confidence', 'limited_confidence', 'limited_confidence', 'limited_confidence', 'limited_confidence', 'not_assessed', 'not_assessed', 'not_assessed')
    const a = computeContentAnalysisCoverage({ eligiblePageCount: 30, lowExtractionConfidenceCount: 0, dimensions: highDims })
    const b = computeContentAnalysisCoverage({ eligiblePageCount: 30, lowExtractionConfidenceCount: 0, dimensions: limitedDims })
    expect(a.dimensionsAssessed).toBe(b.dimensionsAssessed)
    expect(a.percent).toBe(b.percent)
  })

  it('reports honest extraction counts (high vs low confidence pages)', () => {
    const result = computeContentAnalysisCoverage({ eligiblePageCount: 30, lowExtractionConfidenceCount: 10, dimensions: dims('healthy') })
    expect(result.highConfidenceExtractionCount).toBe(20)
    expect(result.lowConfidenceExtractionCount).toBe(10)
  })

  it('never produces a negative highConfidenceExtractionCount even if lowExtractionConfidenceCount exceeds eligiblePageCount (defensive)', () => {
    const result = computeContentAnalysisCoverage({ eligiblePageCount: 5, lowExtractionConfidenceCount: 999, dimensions: dims('healthy') })
    expect(result.highConfidenceExtractionCount).toBe(0)
  })

  it('percent is always between 0 and 100', () => {
    const result = computeContentAnalysisCoverage({ eligiblePageCount: 10, lowExtractionConfidenceCount: 0, dimensions: dims('healthy', 'healthy') })
    expect(result.percent).toBeGreaterThanOrEqual(0)
    expect(result.percent).toBeLessThanOrEqual(100)
  })

  it('a mid-range result (partial extraction confidence, roughly half the dimensions assessed) lands in "medium"', () => {
    const dimensions = dims('healthy', 'healthy', 'healthy', 'healthy', 'healthy', 'not_assessed', 'not_assessed', 'not_assessed', 'not_assessed', 'not_assessed', 'not_assessed', 'not_assessed')
    const result = computeContentAnalysisCoverage({ eligiblePageCount: 30, lowExtractionConfidenceCount: 9, dimensions })
    expect(result.level).toBe('medium')
  })
})
