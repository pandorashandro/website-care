import { describe, expect, it } from 'vitest'
import { analyzeRobots } from '@/lib/technical-seo/checks/robots'
import { makeEvidence, makePage } from './helpers/technical-seo-fixtures'

describe('analyzeRobots', () => {
  it('flags an unreachable robots.txt', () => {
    const evidence = makeEvidence({ crawlRun: { robots_status: 'unreachable' }, pages: [makePage({ url: 'https://example.com/' })] })
    const findings = analyzeRobots(evidence)
    expect(findings.find((f) => f.checkKey === 'robots_unreachable')).toBeDefined()
  })

  /**
   * REGRESSION (evidence-aware health scoring, 2026-09-22) — item 21's
   * exact required fixture: "robots unknown due fetch failure must NOT
   * become confirmed robots defect." Already correct before this sprint —
   * locked in explicitly now alongside the equivalent sitemap fix.
   */
  it('an unreachable robots.txt is worded as uncertainty ("could not be checked"), never a confirmed defect', () => {
    const evidence = makeEvidence({ crawlRun: { robots_status: 'unreachable' }, pages: [makePage({ url: 'https://example.com/' })] })
    const finding = analyzeRobots(evidence).find((f) => f.checkKey === 'robots_unreachable')
    expect(finding?.title.toLowerCase()).toContain('could not be checked')
    expect(finding?.title.toLowerCase()).not.toContain('blocks')
    expect(finding?.title.toLowerCase()).not.toContain('invalid')
  })

  it('infers a site-wide robots block when nearly every crawled page is disallowed', () => {
    const pages = Array.from({ length: 10 }, (_, i) => makePage({ url: `https://example.com/p${i}`, robots_allowed: false }))
    const evidence = makeEvidence({ crawlRun: { robots_status: 'ok' }, pages })
    const findings = analyzeRobots(evidence)
    const finding = findings.find((f) => f.checkKey === 'robots_blocks_site')
    expect(finding).toBeDefined()
    expect(finding?.confidence).toBe('medium') // inferred from effect, not a direct rule read
  })

  it('does not infer a site-wide block from a small crawl (avoids a false positive on a tiny sample)', () => {
    const evidence = makeEvidence({ crawlRun: { robots_status: 'ok' }, pages: [makePage({ url: 'https://example.com/only-page', robots_allowed: false })] })
    const findings = analyzeRobots(evidence)
    expect(findings.find((f) => f.checkKey === 'robots_blocks_site')).toBeUndefined()
  })

  it('does not infer a site-wide block when only a small fraction of pages are disallowed', () => {
    const pages = [
      ...Array.from({ length: 9 }, (_, i) => makePage({ url: `https://example.com/p${i}`, robots_allowed: true })),
      makePage({ url: 'https://example.com/admin', robots_allowed: false }),
    ]
    const evidence = makeEvidence({ crawlRun: { robots_status: 'ok' }, pages })
    const findings = analyzeRobots(evidence)
    expect(findings.find((f) => f.checkKey === 'robots_blocks_site')).toBeUndefined()
  })

  it('produces no findings for a normal, reachable robots.txt (false-positive boundary)', () => {
    const pages = Array.from({ length: 10 }, (_, i) => makePage({ url: `https://example.com/p${i}`, robots_allowed: true }))
    const evidence = makeEvidence({ crawlRun: { robots_status: 'ok' }, pages })
    expect(analyzeRobots(evidence)).toEqual([])
  })
})
