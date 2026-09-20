import { describe, expect, it } from 'vitest'
import { aggregateFindings } from '@/lib/content/aggregate'
import type { RawFinding } from '@/lib/content/types'

function rawFinding(overrides: Partial<RawFinding> = {}): RawFinding {
  return {
    checkKey: 'substantively_thin_page',
    category: 'thinness',
    scope: 'page',
    kind: 'problem',
    evidenceSource: 'deterministic',
    baseSeverity: 'medium',
    confidence: 'high',
    title: 'x',
    explanation: 'x',
    whyItMatters: 'x',
    recommendation: 'x',
    evidence: {},
    affectedPages: [{ url: 'https://example.com/a' }],
    ...overrides,
  }
}

describe('aggregateFindings (Content Intelligence)', () => {
  it('computes affectedPageCount/occurrenceCount/uniqueTargetCount from affected pages', () => {
    const [finding] = aggregateFindings([rawFinding({ affectedPages: [{ url: 'https://example.com/a' }, { url: 'https://example.com/b' }] })], 10)
    expect(finding.affectedPageCount).toBe(2)
    expect(finding.occurrenceCount).toBe(2)
    expect(finding.uniqueTargetCount).toBe(0)
  })

  it('derives uniqueTargetCount from distinct affectedResourceUrl values (duplicate-group count)', () => {
    const [finding] = aggregateFindings(
      [
        rawFinding({
          checkKey: 'exact_duplicate_content',
          affectedPages: [
            { url: 'https://example.com/a1', affectedResourceUrl: 'hash-a' },
            { url: 'https://example.com/a2', affectedResourceUrl: 'hash-a' },
            { url: 'https://example.com/b1', affectedResourceUrl: 'hash-b' },
          ],
        }),
      ],
      10
    )
    expect(finding.affectedPageCount).toBe(3)
    expect(finding.uniqueTargetCount).toBe(2)
  })

  it('carries kind and evidenceSource through from the raw finding', () => {
    const [finding] = aggregateFindings([rawFinding({ checkKey: 'faq_opportunity', kind: 'opportunity' })], 10)
    expect(finding.kind).toBe('opportunity')
    expect(finding.evidenceSource).toBe('deterministic')
  })

  it('assigns actionability from the static CHECK_ACTIONABILITY map', () => {
    const [problem] = aggregateFindings([rawFinding({ checkKey: 'substantively_thin_page' })], 10)
    expect(problem.actionability).toBe('guided_fix')
    const [opportunity] = aggregateFindings([rawFinding({ checkKey: 'faq_opportunity', kind: 'opportunity' })], 10)
    expect(opportunity.actionability).toBe('monitor')
  })

  it('escalates high severity to critical when widespread (shared category-engine severity rule)', () => {
    const affectedPages = Array.from({ length: 9 }, (_, i) => ({ url: `https://example.com/p${i}` }))
    const [finding] = aggregateFindings([rawFinding({ checkKey: 'exact_duplicate_content', baseSeverity: 'high', affectedPages })], 10)
    expect(finding.severity).toBe('critical')
  })

  it('never escalates low/medium severity regardless of prevalence', () => {
    const affectedPages = Array.from({ length: 10 }, (_, i) => ({ url: `https://example.com/p${i}` }))
    const [finding] = aggregateFindings([rawFinding({ baseSeverity: 'medium', affectedPages })], 10)
    expect(finding.severity).toBe('medium')
  })
})
