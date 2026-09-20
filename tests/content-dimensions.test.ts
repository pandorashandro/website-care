import { describe, expect, it } from 'vitest'
import { computeDimensionStatuses } from '@/lib/content/dimensions'

function purposeFinding(overrides: Record<string, unknown> = {}) {
  return { checkKey: 'page_purpose_summary', kind: 'opportunity' as const, evidence: { eligiblePageCount: 10, lowExtractionConfidenceCount: 0, homepageCount: 1, contactCount: 1, unknownCount: 8, ...overrides } }
}

describe('computeDimensionStatuses — the 12 canonical Content Intelligence dimensions', () => {
  it('returns exactly 12 dimensions, always, regardless of input', () => {
    const result = computeDimensionStatuses({ findings: [], eligiblePageCount: 0 })
    expect(result).toHaveLength(12)
  })

  it('marks every dimension not_assessed when there are zero eligible pages (no fake healthy)', () => {
    const result = computeDimensionStatuses({ findings: [], eligiblePageCount: 0 })
    const alwaysNotAssessed = ['content_depth', 'duplicate_content', 'repetitive_content', 'content_structure', 'page_purpose', 'faq_coverage', 'content_differentiation']
    for (const key of alwaysNotAssessed) {
      expect(result.find((d) => d.key === key)?.status).toBe('not_assessed')
    }
  })

  describe('Content Depth', () => {
    it('is "healthy" when eligible pages exist and no thin-content finding is present', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding()], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'content_depth')?.status).toBe('healthy')
    })

    it('is "findings" when substantively_thin_page is present', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding(), { checkKey: 'substantively_thin_page', kind: 'problem' }], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'content_depth')?.status).toBe('findings')
    })

    it('is "limited_confidence" when a large fraction of pages had low extraction confidence, even with no thin-content finding', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding({ lowExtractionConfidenceCount: 5, eligiblePageCount: 10 })], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'content_depth')?.status).toBe('limited_confidence')
    })
  })

  describe('Content Completeness (AI-derived, not live by default)', () => {
    it('is "not_assessed" when no AI findings exist', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding()], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'content_completeness')?.status).toBe('not_assessed')
    })

    it('is "findings" when content_completeness_gap is present', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding(), { checkKey: 'content_completeness_gap', kind: 'problem' }], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'content_completeness')?.status).toBe('findings')
    })

    it('is "opportunities" when only content_completeness_opportunity is present', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding(), { checkKey: 'content_completeness_opportunity', kind: 'opportunity' }], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'content_completeness')?.status).toBe('opportunities')
    })
  })

  it('Content Quality & Clarity is always not_assessed in this analyzer version', () => {
    const result = computeDimensionStatuses({ findings: [purposeFinding()], eligiblePageCount: 10 })
    expect(result.find((d) => d.key === 'quality_clarity')?.status).toBe('not_assessed')
  })

  describe('Duplicate Content', () => {
    it('is "limited_confidence" (never a confident "healthy") with eligible pages and no exact-duplicate finding — exact-hash detection cannot see near-duplicate content, a known blind spot', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding()], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'duplicate_content')?.status).toBe('limited_confidence')
    })

    it('is "findings" when exact_duplicate_content is present', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding(), { checkKey: 'exact_duplicate_content', kind: 'problem' }], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'duplicate_content')?.status).toBe('findings')
    })
  })

  describe('Repetitive / Boilerplate Content', () => {
    it('is "limited_confidence" when fewer than 5 eligible pages exist (too few for a reliable cross-page pattern)', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding({ eligiblePageCount: 3 })], eligiblePageCount: 3 })
      expect(result.find((d) => d.key === 'repetitive_content')?.status).toBe('limited_confidence')
    })

    it('is "healthy" with 5+ eligible pages and no repetitive finding', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding()], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'repetitive_content')?.status).toBe('healthy')
    })

    it('is "findings" when highly_repetitive_page is present', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding(), { checkKey: 'highly_repetitive_page', kind: 'problem' }], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'repetitive_content')?.status).toBe('findings')
    })
  })

  describe('Content Structure', () => {
    it('is "findings" when weak_content_structure is present, "healthy" otherwise', () => {
      const withFinding = computeDimensionStatuses({ findings: [purposeFinding(), { checkKey: 'weak_content_structure', kind: 'problem' }], eligiblePageCount: 10 })
      const without = computeDimensionStatuses({ findings: [purposeFinding()], eligiblePageCount: 10 })
      expect(withFinding.find((d) => d.key === 'content_structure')?.status).toBe('findings')
      expect(without.find((d) => d.key === 'content_structure')?.status).toBe('healthy')
    })

    it('MINIMUM EVIDENCE RULE: is "not_assessed", never a fabricated "healthy", when zero pages had enough substantive content to evaluate structure at all', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding({ substantiveEligiblePageCount: 0 })], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'content_structure')?.status).toBe('not_assessed')
    })
  })

  describe('Page Purpose', () => {
    it('is "healthy" (displayed as Analyzed) when most pages are classified', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding({ unknownCount: 2, eligiblePageCount: 10 })], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'page_purpose')?.status).toBe('healthy')
    })

    it('is "limited_confidence" when most pages are unclassified', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding({ unknownCount: 9, eligiblePageCount: 10 })], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'page_purpose')?.status).toBe('limited_confidence')
    })

    it('never reports "findings" — Page Purpose is intelligence, never a problem', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding({ unknownCount: 10, eligiblePageCount: 10 })], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'page_purpose')?.status).not.toBe('findings')
    })
  })

  describe('FAQ / Question Coverage', () => {
    it('is "opportunities" (never "findings") when faq_opportunity is present', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding(), { checkKey: 'faq_opportunity', kind: 'opportunity' }], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'faq_coverage')?.status).toBe('opportunities')
    })

    it('is "healthy" when no FAQ opportunity is flagged', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding()], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'faq_coverage')?.status).toBe('healthy')
    })

    it('MINIMUM EVIDENCE RULE: is "not_assessed", never a fabricated "healthy", when zero pages had enough substantive content for FAQ relevance to be evaluated at all', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding({ substantiveEligiblePageCount: 0 })], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'faq_coverage')?.status).toBe('not_assessed')
    })
  })

  it('Topical Coverage is always not_assessed in this analyzer version', () => {
    const result = computeDimensionStatuses({ findings: [purposeFinding()], eligiblePageCount: 10 })
    expect(result.find((d) => d.key === 'topical_coverage')?.status).toBe('not_assessed')
  })

  describe('Content Differentiation (derived from duplicate/repetitive evidence, never a new deduction)', () => {
    it('is "findings" when exact_duplicate_content or highly_repetitive_page exists', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding(), { checkKey: 'exact_duplicate_content', kind: 'problem' }], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'content_differentiation')?.status).toBe('findings')
    })

    it('is "limited_confidence" (never a confident "healthy") when no overlap evidence exists — broader differentiation is not assessed', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding()], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'content_differentiation')?.status).toBe('limited_confidence')
    })
  })

  it('Content Freshness is always not_assessed — no reliable date evidence is persisted', () => {
    const result = computeDimensionStatuses({ findings: [purposeFinding()], eligiblePageCount: 10 })
    expect(result.find((d) => d.key === 'content_freshness')?.status).toBe('not_assessed')
  })

  describe('Content Opportunities (rollup)', () => {
    it('is "healthy" when no opportunity-kind findings exist (excluding the always-on page_purpose_summary)', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding()], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'content_opportunities')?.status).toBe('healthy')
    })

    it('is "opportunities" when a real opportunity finding exists (e.g. faq_opportunity)', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding(), { checkKey: 'faq_opportunity', kind: 'opportunity' }], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'content_opportunities')?.status).toBe('opportunities')
    })

    it('never counts page_purpose_summary itself toward the opportunities rollup (it is its own dimension)', () => {
      const result = computeDimensionStatuses({ findings: [purposeFinding()], eligiblePageCount: 10 })
      expect(result.find((d) => d.key === 'content_opportunities')?.summary).not.toContain('page_purpose_summary')
    })
  })

  it('every dimension has a non-empty, human-readable summary — never a bare status word', () => {
    const result = computeDimensionStatuses({ findings: [purposeFinding()], eligiblePageCount: 10 })
    for (const dimension of result) {
      expect(dimension.summary.length).toBeGreaterThan(10)
    }
  })
})
