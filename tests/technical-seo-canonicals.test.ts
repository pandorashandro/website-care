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

  /**
   * Scoring Engine V2 false-positive fix (2026-09-24): a self-referencing
   * canonical on a NOINDEX page — the textbook-correct configuration for an
   * intentionally excluded utility page (a thank-you/confirmation page,
   * a login page, etc.) — was previously ALSO flagged as
   * canonical_target_non_indexable, on top of the separate, correct
   * noindex_page finding from indexability.ts. "This page's canonical
   * target is non-indexable" is tautological when the target IS the page
   * itself declaring its own (intentional) noindex status — it is not a
   * genuine cross-page canonical problem. Regression for the exact shape
   * caught by tests/validation-lab.test.ts's noindex-site fixture.
   */
  it('a self-referencing canonical on a noindex page is NOT a canonical_target_non_indexable finding — that would be tautological, not a real cross-page problem', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/thank-you', canonical_url: 'https://example.com/thank-you', noindex: true })] })
    const findings = analyzeCanonicals(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'canonical_target_non_indexable')).toBeUndefined()
  })
})
