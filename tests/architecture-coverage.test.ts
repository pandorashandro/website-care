import { describe, expect, it } from 'vitest'
import { computeArchitectureCoverage } from '@/lib/architecture/coverage'
import { makePage } from './helpers/architecture-fixtures'

describe('computeArchitectureCoverage', () => {
  it('0 eligible pages is none', () => {
    const blocked = makePage({ url: 'https://example.com/', http_status: 403 })
    const coverage = computeArchitectureCoverage([blocked], 1)
    expect(coverage.level).toBe('none')
    expect(coverage.eligiblePageCount).toBe(0)
  })

  it('exactly 1 eligible page is low, and graph-comparison checks are not assessed', () => {
    const page = makePage({ url: 'https://example.com/' })
    const coverage = computeArchitectureCoverage([page], 1)
    expect(coverage.level).toBe('low')
    expect(coverage.graphChecksAssessed).toBe(false)
  })

  it('2+ eligible pages is adequate, and graph-comparison checks are assessed', () => {
    const pages = [makePage({ url: 'https://example.com/a' }), makePage({ url: 'https://example.com/b' })]
    const coverage = computeArchitectureCoverage(pages, 2)
    expect(coverage.level).toBe('adequate')
    expect(coverage.graphChecksAssessed).toBe(true)
  })

  it('a noindexed or cross-canonical page does not count toward eligiblePageCount', () => {
    const noindexed = makePage({ url: 'https://example.com/a', noindex: true })
    const crossCanonical = makePage({ url: 'https://example.com/b', canonical_url: 'https://example.com/real' })
    const coverage = computeArchitectureCoverage([noindexed, crossCanonical], 2)
    expect(coverage.eligiblePageCount).toBe(0)
    expect(coverage.level).toBe('none')
  })
})
