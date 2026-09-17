import { describe, expect, it } from 'vitest'
import { aggregateFindings } from '@/lib/architecture/aggregate'
import type { RawFinding } from '@/lib/architecture/types'

function rawFinding(overrides: Partial<RawFinding> = {}): RawFinding {
  return {
    checkKey: 'orphan_page',
    category: 'orphan_pages',
    scope: 'page',
    baseSeverity: 'medium',
    confidence: 'high',
    title: 'Title',
    explanation: 'Explanation',
    whyItMatters: 'Why',
    recommendation: 'Recommendation',
    evidence: {},
    affectedPages: [],
    ...overrides,
  }
}

describe('architecture aggregateFindings', () => {
  it('produces one finding per distinct checkKey', () => {
    const findings = aggregateFindings(
      [rawFinding({ checkKey: 'orphan_page' }), rawFinding({ checkKey: 'dead_end_page', category: 'dead_ends' })],
      10
    )
    expect(findings.map((f) => f.checkKey).sort()).toEqual(['dead_end_page', 'orphan_page'])
  })

  it('deduplicates instances sharing the same (url, affectedResourceUrl) while preserving distinct edges', () => {
    const findings = aggregateFindings(
      [
        rawFinding({
          checkKey: 'internal_link_to_broken_edge',
          affectedPages: [
            { url: 'https://example.com/a', affectedResourceUrl: 'https://example.com/x' },
            { url: 'https://example.com/a', affectedResourceUrl: 'https://example.com/y' },
            { url: 'https://example.com/a', affectedResourceUrl: 'https://example.com/x' }, // exact duplicate
          ],
        }),
      ],
      10
    )
    expect(findings[0].occurrenceCount).toBe(2)
    expect(findings[0].affectedPageCount).toBe(1)
    expect(findings[0].uniqueTargetCount).toBe(2)
  })

  it('attaches a truthful (never safe_fix/prepared_fix) actionability classification', () => {
    const findings = aggregateFindings([rawFinding({ checkKey: 'orphan_page' })], 10)
    expect(findings[0].actionability).not.toBe('safe_fix')
    expect(findings[0].actionability).not.toBe('prepared_fix')
  })

  it('returns an empty array for no raw findings (a clean architecture)', () => {
    expect(aggregateFindings([], 10)).toEqual([])
  })

  it('takes the highest base severity among merged instances sharing a checkKey', () => {
    const findings = aggregateFindings(
      [rawFinding({ checkKey: 'orphan_page', baseSeverity: 'low' }), rawFinding({ checkKey: 'orphan_page', baseSeverity: 'high' })],
      10
    )
    expect(findings[0].severity).toBe('high')
  })
})
