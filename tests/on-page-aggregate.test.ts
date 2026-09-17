import { describe, expect, it } from 'vitest'
import { aggregateFindings } from '@/lib/on-page/aggregate'
import type { RawFinding } from '@/lib/on-page/types'

function rawFinding(overrides: Partial<RawFinding> = {}): RawFinding {
  return {
    checkKey: 'missing_title',
    category: 'title',
    scope: 'page',
    baseSeverity: 'high',
    confidence: 'high',
    title: 'Pages have no title tag',
    explanation: 'x',
    whyItMatters: 'x',
    recommendation: 'x',
    evidence: {},
    affectedPages: [{ url: 'https://example.com/a' }],
    ...overrides,
  }
}

describe('aggregateFindings (On-Page SEO)', () => {
  it('computes affectedPageCount/occurrenceCount/uniqueTargetCount from affected pages', () => {
    const [finding] = aggregateFindings([rawFinding({ affectedPages: [{ url: 'https://example.com/a' }, { url: 'https://example.com/b' }] })], 10)
    expect(finding.affectedPageCount).toBe(2)
    expect(finding.occurrenceCount).toBe(2)
    expect(finding.uniqueTargetCount).toBe(0) // no affectedResourceUrl on page-level findings
  })

  it('derives uniqueTargetCount from distinct affectedResourceUrl values (duplicate-group count)', () => {
    const [finding] = aggregateFindings(
      [
        rawFinding({
          checkKey: 'duplicate_title',
          affectedPages: [
            { url: 'https://example.com/a1', affectedResourceUrl: 'group a' },
            { url: 'https://example.com/a2', affectedResourceUrl: 'group a' },
            { url: 'https://example.com/b1', affectedResourceUrl: 'group b' },
          ],
        }),
      ],
      10
    )
    expect(finding.affectedPageCount).toBe(3)
    expect(finding.uniqueTargetCount).toBe(2)
  })

  it('deduplicates identical (url, affectedResourceUrl) instances', () => {
    const [finding] = aggregateFindings(
      [rawFinding({ affectedPages: [{ url: 'https://example.com/a' }, { url: 'https://example.com/a' }] })],
      10
    )
    expect(finding.affectedPageCount).toBe(1)
    expect(finding.occurrenceCount).toBe(1)
  })

  it('assigns actionability from the static CHECK_ACTIONABILITY map', () => {
    const [finding] = aggregateFindings([rawFinding({ checkKey: 'missing_title' })], 10)
    expect(finding.actionability).toBe('prepared_fix')
    const [guided] = aggregateFindings([rawFinding({ checkKey: 'duplicate_title' })], 10)
    expect(guided.actionability).toBe('guided_fix')
  })

  it('escalates high severity to critical when widespread (shared category-engine severity rule)', () => {
    const affectedPages = Array.from({ length: 9 }, (_, i) => ({ url: `https://example.com/p${i}` }))
    const [finding] = aggregateFindings([rawFinding({ baseSeverity: 'high', affectedPages })], 10) // 9/10 = 90% >= 50%
    expect(finding.severity).toBe('critical')
  })

  it('never escalates low/medium severity regardless of prevalence (shared rule)', () => {
    const affectedPages = Array.from({ length: 10 }, (_, i) => ({ url: `https://example.com/p${i}` }))
    const [finding] = aggregateFindings([rawFinding({ checkKey: 'title_too_short', baseSeverity: 'low', affectedPages })], 10)
    expect(finding.severity).toBe('low')
  })
})
