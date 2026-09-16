import { describe, expect, it } from 'vitest'
import { aggregateFindings } from '@/lib/technical-seo/aggregate'
import type { RawFinding } from '@/lib/technical-seo/types'

function rawFinding(overrides: Partial<RawFinding> = {}): RawFinding {
  return {
    checkKey: 'fetch_failed',
    category: 'crawlability',
    scope: 'page',
    baseSeverity: 'high',
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

describe('aggregateFindings', () => {
  it('produces one finding per distinct checkKey', () => {
    const findings = aggregateFindings(
      [rawFinding({ checkKey: 'fetch_failed' }), rawFinding({ checkKey: 'noindex_page', category: 'indexability' })],
      10
    )
    expect(findings.map((f) => f.checkKey).sort()).toEqual(['fetch_failed', 'noindex_page'])
  })

  it('merges multiple raw instances sharing the same checkKey into one finding', () => {
    const findings = aggregateFindings(
      [
        rawFinding({ checkKey: 'internal_page_4xx', baseSeverity: 'medium', affectedPages: [{ url: 'https://example.com/a' }] }),
        rawFinding({ checkKey: 'internal_page_4xx', baseSeverity: 'high', affectedPages: [{ url: 'https://example.com/b' }] }),
      ],
      10
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].affectedPages.map((p) => p.url).sort()).toEqual(['https://example.com/a', 'https://example.com/b'])
  })

  it('takes the HIGHEST base severity among merged instances', () => {
    const findings = aggregateFindings(
      [rawFinding({ checkKey: 'internal_page_4xx', baseSeverity: 'medium' }), rawFinding({ checkKey: 'internal_page_4xx', baseSeverity: 'high' })],
      10
    )
    // With only 2 affected pages (0 here — using defaults) out of 10, not
    // widespread, so 'high' survives unescalated as the final severity.
    expect(findings[0].severity).toBe('high')
  })

  it('takes the LOWEST (most conservative) confidence among merged instances', () => {
    const findings = aggregateFindings(
      [rawFinding({ checkKey: 'internal_page_4xx', confidence: 'high' }), rawFinding({ checkKey: 'internal_page_4xx', confidence: 'low' })],
      10
    )
    expect(findings[0].confidence).toBe('low')
  })

  it('keeps the copy (title/explanation/etc.) from the highest-severity merged instance', () => {
    const findings = aggregateFindings(
      [
        rawFinding({ checkKey: 'internal_page_4xx', baseSeverity: 'medium', title: 'Other 4xx' }),
        rawFinding({ checkKey: 'internal_page_4xx', baseSeverity: 'critical', title: '404s' }),
      ],
      10
    )
    expect(findings[0].title).toBe('404s')
  })

  it('deduplicates affected pages sharing the same URL across merged instances, keeping the first detail', () => {
    const findings = aggregateFindings(
      [
        rawFinding({ checkKey: 'internal_page_4xx', affectedPages: [{ url: 'https://example.com/a', detail: { httpStatus: 404 } }] }),
        rawFinding({ checkKey: 'internal_page_4xx', affectedPages: [{ url: 'https://example.com/a', detail: { httpStatus: 500 } }] }),
      ],
      10
    )
    expect(findings[0].affectedPages).toHaveLength(1)
    expect(findings[0].affectedPages[0].detail).toEqual({ httpStatus: 404 })
  })

  it('attaches a truthful (never safe_fix/prepared_fix) actionability classification', () => {
    const findings = aggregateFindings([rawFinding({ checkKey: 'fetch_failed' })], 10)
    expect(findings[0].actionability).not.toBe('safe_fix')
    expect(findings[0].actionability).not.toBe('prepared_fix')
  })

  it('returns an empty array for no raw findings (a clean crawl)', () => {
    expect(aggregateFindings([], 10)).toEqual([])
  })
})
