import { describe, expect, it } from 'vitest'
import { computeSiteAccessState, describeMostCommonIneligibilityReason } from '@/lib/category-engine/site-access'
import { makePage } from './helpers/architecture-fixtures'

/**
 * Evidence-aware health scoring (2026-09-22). computeSiteAccessState is
 * the ONE, coarse, whole-crawl signal Overview uses to prominently surface
 * "webioom couldn't fully access this website" — separate from each
 * engine's own finer-grained coverage record.
 */
describe('computeSiteAccessState', () => {
  it('REGRESSION — the exact reported bug (a single 403 homepage) is "blocked"', () => {
    const blocked = makePage({ url: 'https://example.com/', http_status: 403, noindex: true })
    expect(computeSiteAccessState([blocked])).toBe('blocked')
  })

  it('a 401 response is also "blocked"', () => {
    expect(computeSiteAccessState([makePage({ url: 'https://example.com/', http_status: 401 })])).toBe('blocked')
  })

  it('a 429 (rate-limited) response is also "blocked"', () => {
    expect(computeSiteAccessState([makePage({ url: 'https://example.com/', http_status: 429 })])).toBe('blocked')
  })

  it('a 5xx response is also "blocked"', () => {
    expect(computeSiteAccessState([makePage({ url: 'https://example.com/', http_status: 503 })])).toBe('blocked')
  })

  it('every page failing to fetch at all (no response whatsoever) is "fetch_failed"', () => {
    const failed = makePage({ url: 'https://example.com/', status: 'failed', http_status: null })
    expect(computeSiteAccessState([failed])).toBe('fetch_failed')
  })

  it('an empty page list (nothing crawled) is "fetch_failed"', () => {
    expect(computeSiteAccessState([])).toBe('fetch_failed')
  })

  it('a 2xx page that is noindexed (genuinely, not a block) is "insufficient_content", never "blocked"', () => {
    const noindexed = makePage({ url: 'https://example.com/', http_status: 200, noindex: true })
    expect(computeSiteAccessState([noindexed])).toBe('insufficient_content')
  })

  it('a normal, eligible 2xx page is "accessible"', () => {
    expect(computeSiteAccessState([makePage({ url: 'https://example.com/' })])).toBe('accessible')
  })

  it('a mix of eligible and blocked pages is "partially_accessible" — real evidence exists, but not the full picture', () => {
    const eligible = makePage({ url: 'https://example.com/a' })
    const blocked = makePage({ url: 'https://example.com/b', http_status: 403 })
    expect(computeSiteAccessState([eligible, blocked])).toBe('partially_accessible')
  })
})

describe('describeMostCommonIneligibilityReason (shared, re-exported by lib/on-page/coverage.ts)', () => {
  it('describes a blocked/error page', () => {
    const page = makePage({ url: 'https://example.com/', http_status: 403 })
    expect(describeMostCommonIneligibilityReason([page])).toContain('firewall or bot-protection block')
  })

  it('returns null when nothing is excluded', () => {
    expect(describeMostCommonIneligibilityReason([makePage({ url: 'https://example.com/' })])).toBeNull()
  })
})
