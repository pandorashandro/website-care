import { describe, expect, it } from 'vitest'
import { analyzeRedirects } from '@/lib/technical-seo/checks/redirects'
import { aggregateFindings } from '@/lib/technical-seo/aggregate'
import { buildPageIndex, buildInboundLinkCounts, completedPages } from '@/lib/technical-seo/evidence'
import type { AnalyzerContext } from '@/lib/technical-seo/context'
import { makeEvidence, makePage, makeLink } from './helpers/technical-seo-fixtures'
import type { CrawlEvidence } from '@/lib/technical-seo/evidence'

function contextFor(evidence: CrawlEvidence): AnalyzerContext {
  return { pageIndex: buildPageIndex(evidence), inboundLinkCounts: buildInboundLinkCounts(evidence), totalAnalyzedPages: completedPages(evidence).length }
}

describe('analyzeRedirects', () => {
  it('flags an internal link pointing to a URL that redirected', () => {
    const source = makePage({ url: 'https://example.com/home' })
    const target = makePage({ url: 'https://example.com/old', final_url: 'https://example.com/new' })
    const evidence = makeEvidence({ pages: [source, target], links: [makeLink({ source_page_id: source.id, target_url: 'https://example.com/old' })] })

    const findings = analyzeRedirects(evidence, contextFor(evidence))
    const finding = findings.find((f) => f.checkKey === 'internal_link_to_redirected_url')
    expect(finding).toBeDefined()
    expect(finding?.affectedPages[0].detail).toMatchObject({ linksTo: 'https://example.com/old' })
  })

  it('flags an internal link pointing to a broken (failed) URL', () => {
    const source = makePage({ url: 'https://example.com/home' })
    const target = makePage({ url: 'https://example.com/gone', status: 'failed', error_reason: 'network', http_status: null })
    const evidence = makeEvidence({ pages: [source, target], links: [makeLink({ source_page_id: source.id, target_url: 'https://example.com/gone' })] })

    const findings = analyzeRedirects(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'internal_link_to_broken_url')).toBeDefined()
  })

  it('flags an internal link pointing to a 404 target', () => {
    const source = makePage({ url: 'https://example.com/home' })
    const target = makePage({ url: 'https://example.com/missing', http_status: 404 })
    const evidence = makeEvidence({ pages: [source, target], links: [makeLink({ source_page_id: source.id, target_url: 'https://example.com/missing' })] })

    const findings = analyzeRedirects(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'internal_link_to_broken_url')).toBeDefined()
  })

  it('does not flag an external link target', () => {
    const source = makePage({ url: 'https://example.com/home' })
    const evidence = makeEvidence({
      pages: [source],
      links: [makeLink({ source_page_id: source.id, target_url: 'https://external.example/x', link_type: 'external' })],
    })

    const findings = analyzeRedirects(evidence, contextFor(evidence))
    expect(findings).toEqual([])
  })

  it('flags an HTTPS page that redirects to an insecure HTTP URL', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/a', final_url: 'http://example.com/a' })] })
    const findings = analyzeRedirects(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'https_downgrade_redirect')).toBeDefined()
  })

  it('produces no findings for a healthy internal link graph (false-positive boundary)', () => {
    const source = makePage({ url: 'https://example.com/home' })
    const target = makePage({ url: 'https://example.com/about', final_url: 'https://example.com/about' })
    const evidence = makeEvidence({ pages: [source, target], links: [makeLink({ source_page_id: source.id, target_url: 'https://example.com/about' })] })

    expect(analyzeRedirects(evidence, contextFor(evidence))).toEqual([])
  })

  describe('evidence-first remediation (Phase 26B, Checkpoint 6/9)', () => {
    it('expresses source -> current target -> final destination -> proposed replacement for a redirected internal link', () => {
      const source = makePage({ url: 'https://example.com/home' })
      const target = makePage({ url: 'https://example.com/old-url', final_url: 'https://example.com/new-url', http_status: 301 })
      const evidence = makeEvidence({ pages: [source, target], links: [makeLink({ source_page_id: source.id, target_url: 'https://example.com/old-url' })] })

      const findings = analyzeRedirects(evidence, contextFor(evidence))
      const instance = findings.find((f) => f.checkKey === 'internal_link_to_redirected_url')?.affectedPages[0]

      expect(instance?.url).toBe('https://example.com/home') // source page
      expect(instance?.affectedResourceUrl).toBe('https://example.com/old-url') // problematic resource
      expect(instance?.currentState?.value).toContain('https://example.com/old-url') // observed state
      expect(instance?.desiredState?.value).toBe('https://example.com/new-url') // final destination as the desired state
      expect(instance?.proposedChange).toContain('https://example.com/new-url') // proposed change
      expect(instance?.remediationType).toBe('url_replacement')
    })

    it('never invents a desired state for a broken (non-redirecting) target — no confident replacement exists', () => {
      const source = makePage({ url: 'https://example.com/home' })
      const target = makePage({ url: 'https://example.com/missing', http_status: 404 })
      const evidence = makeEvidence({ pages: [source, target], links: [makeLink({ source_page_id: source.id, target_url: 'https://example.com/missing' })] })

      const findings = analyzeRedirects(evidence, contextFor(evidence))
      const instance = findings.find((f) => f.checkKey === 'internal_link_to_broken_url')?.affectedPages[0]
      expect(instance?.desiredState).toBeNull()
    })

    it('distinguishes occurrences, source pages, and unique targets correctly at the aggregate level — the exact real-world "19 occurrences / 2 pages" ambiguity this checkpoint exists to fix', () => {
      // Two source pages, each linking to the SAME two redirecting targets
      // (target-a, target-b) via multiple distinct links -- 2 sources x 2
      // targets = 4 distinct (source, target) edges, i.e. 4 occurrences,
      // across 2 source pages, hitting 2 unique targets. Every number is
      // different and every one must be reported correctly, never conflated.
      const sourceA = makePage({ url: 'https://example.com/page-a' })
      const sourceB = makePage({ url: 'https://example.com/page-b' })
      const targetOne = makePage({ url: 'https://example.com/old-1', final_url: 'https://example.com/new-1' })
      const targetTwo = makePage({ url: 'https://example.com/old-2', final_url: 'https://example.com/new-2' })

      const evidence = makeEvidence({
        pages: [sourceA, sourceB, targetOne, targetTwo],
        links: [
          makeLink({ source_page_id: sourceA.id, target_url: 'https://example.com/old-1' }),
          makeLink({ source_page_id: sourceA.id, target_url: 'https://example.com/old-2' }),
          makeLink({ source_page_id: sourceB.id, target_url: 'https://example.com/old-1' }),
          makeLink({ source_page_id: sourceB.id, target_url: 'https://example.com/old-2' }),
        ],
      })

      const rawFindings = analyzeRedirects(evidence, contextFor(evidence))
      const aggregated = aggregateFindings(rawFindings, 4)
      const finding = aggregated.find((f) => f.checkKey === 'internal_link_to_redirected_url')

      expect(finding?.affectedPageCount).toBe(2) // 2 distinct source pages
      expect(finding?.uniqueTargetCount).toBe(2) // 2 distinct redirecting targets
      expect(finding?.occurrenceCount).toBe(4) // 4 distinct (source, target) edges — never collapsed to 2
    })

    it('a single source page linking to two DIFFERENT broken targets produces two distinct instances, not one', () => {
      const source = makePage({ url: 'https://example.com/hub' })
      const brokenOne = makePage({ url: 'https://example.com/broken-1', http_status: 404 })
      const brokenTwo = makePage({ url: 'https://example.com/broken-2', http_status: 500 })
      const evidence = makeEvidence({
        pages: [source, brokenOne, brokenTwo],
        links: [
          makeLink({ source_page_id: source.id, target_url: 'https://example.com/broken-1' }),
          makeLink({ source_page_id: source.id, target_url: 'https://example.com/broken-2' }),
        ],
      })

      const rawFindings = analyzeRedirects(evidence, contextFor(evidence))
      const aggregated = aggregateFindings(rawFindings, 3)
      const finding = aggregated.find((f) => f.checkKey === 'internal_link_to_broken_url')

      expect(finding?.affectedPageCount).toBe(1) // one source page
      expect(finding?.uniqueTargetCount).toBe(2) // two distinct broken targets
      expect(finding?.occurrenceCount).toBe(2) // both instances preserved — Phase 26A's dedupe-by-source-url-alone bug is fixed
    })
  })
})
