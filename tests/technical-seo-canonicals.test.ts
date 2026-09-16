import { describe, expect, it } from 'vitest'
import { analyzeCanonicals } from '@/lib/technical-seo/checks/canonicals'
import { buildPageIndex, buildInboundLinkCounts, completedPages } from '@/lib/technical-seo/evidence'
import type { AnalyzerContext } from '@/lib/technical-seo/context'
import { makeEvidence, makePage } from './helpers/technical-seo-fixtures'
import type { CrawlEvidence } from '@/lib/technical-seo/evidence'

function contextFor(evidence: CrawlEvidence): AnalyzerContext {
  return { pageIndex: buildPageIndex(evidence), inboundLinkCounts: buildInboundLinkCounts(evidence), totalAnalyzedPages: completedPages(evidence).length }
}

describe('analyzeCanonicals', () => {
  it('flags a successful HTML page with no canonical tag', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/a', canonical_url: null })] })
    const findings = analyzeCanonicals(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'missing_canonical')).toBeDefined()
  })

  it('does not flag a non-HTML resource for a missing canonical', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/file.pdf', canonical_url: null, content_type: 'application/pdf' })] })
    const findings = analyzeCanonicals(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'missing_canonical')).toBeUndefined()
  })

  it('flags a canonical tag that does not resolve to a valid http/https URL', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/a', canonical_url: 'javascript:alert(1)' })] })
    const findings = analyzeCanonicals(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'invalid_canonical')).toBeDefined()
  })

  it('flags a same-host canonical that downgrades an HTTPS page to HTTP (Phase 26B — migrated from the legacy scanner\'s canonical_http check)', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/a', canonical_url: 'http://example.com/a' })] })
    const findings = analyzeCanonicals(evidence, contextFor(evidence))
    const finding = findings.find((f) => f.checkKey === 'canonical_http_downgrade')
    expect(finding).toBeDefined()
    expect(finding?.affectedPages[0].desiredState?.value).toBe('https://example.com/a')
  })

  it('does not flag an already-HTTPS canonical as a downgrade', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/a', canonical_url: 'https://example.com/a' })] })
    const findings = analyzeCanonicals(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'canonical_http_downgrade')).toBeUndefined()
  })

  it('flags a canonical pointing to a different domain, with only medium confidence', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/a', canonical_url: 'https://other-domain.com/a' })] })
    const findings = analyzeCanonicals(evidence, contextFor(evidence))
    const finding = findings.find((f) => f.checkKey === 'canonical_cross_domain')
    expect(finding).toBeDefined()
    expect(finding?.confidence).toBe('medium')
  })

  it('flags a canonical whose target (crawled in the same run) returned an error', () => {
    const evidence = makeEvidence({
      pages: [
        makePage({ url: 'https://example.com/a', canonical_url: 'https://example.com/b' }),
        makePage({ url: 'https://example.com/b', http_status: 404 }),
      ],
    })
    const findings = analyzeCanonicals(evidence, contextFor(evidence))
    const finding = findings.find((f) => f.checkKey === 'canonical_target_error')
    expect(finding).toBeDefined()
    expect(finding?.affectedPages[0].detail).toMatchObject({ targetStatus: 404 })
  })

  it('flags a canonical whose target is itself non-indexable', () => {
    const evidence = makeEvidence({
      pages: [
        makePage({ url: 'https://example.com/a', canonical_url: 'https://example.com/b' }),
        makePage({ url: 'https://example.com/b', noindex: true }),
      ],
    })
    const findings = analyzeCanonicals(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'canonical_target_non_indexable')).toBeDefined()
  })

  it('does not claim a canonical target is broken when the target was never discovered by this crawl (not evaluable, not guessed)', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/a', canonical_url: 'https://example.com/never-crawled' })] })
    const findings = analyzeCanonicals(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'canonical_target_error')).toBeUndefined()
    expect(findings.find((f) => f.checkKey === 'canonical_target_non_indexable')).toBeUndefined()
  })

  it('a page whose canonical points to itself produces no target-quality finding (false-positive boundary)', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/a', canonical_url: 'https://example.com/a' })] })
    const findings = analyzeCanonicals(evidence, contextFor(evidence))
    expect(findings).toEqual([])
  })
})
