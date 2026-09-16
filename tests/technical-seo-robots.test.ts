import { describe, expect, it } from 'vitest'
import { analyzeRobots } from '@/lib/technical-seo/checks/robots'
import { makeEvidence, makePage } from './helpers/technical-seo-fixtures'

describe('analyzeRobots', () => {
  it('flags an unreachable robots.txt', () => {
    const evidence = makeEvidence({ crawlRun: { robots_status: 'unreachable' }, pages: [makePage({ url: 'https://example.com/' })] })
    const findings = analyzeRobots(evidence)
    expect(findings.find((f) => f.checkKey === 'robots_unreachable')).toBeDefined()
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
