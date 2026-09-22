import { describe, expect, it } from 'vitest'
import { computePillarCoverage } from '@/lib/pillars/coverage'
import { makePage } from './helpers/architecture-fixtures'

describe('computePillarCoverage', () => {
  it('0 eligible pages is none', () => {
    const blocked = makePage({ url: 'https://example.com/', http_status: 403 })
    expect(computePillarCoverage([blocked], 1).level).toBe('none')
  })

  it('even 1 eligible page is adequate — no artificial "low" tier since every pillar check is meaningful from a single page', () => {
    const page = makePage({ url: 'https://example.com/' })
    const coverage = computePillarCoverage([page], 1)
    expect(coverage.level).toBe('adequate')
    expect(coverage.eligiblePageCount).toBe(1)
  })

  it('a noindexed page does not count toward eligiblePageCount', () => {
    const noindexed = makePage({ url: 'https://example.com/', noindex: true })
    expect(computePillarCoverage([noindexed], 1).level).toBe('none')
  })
})
