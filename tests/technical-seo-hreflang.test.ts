import { describe, expect, it } from 'vitest'
import { analyzeHreflang } from '@/lib/technical-seo/checks/hreflang'
import { buildPageIndex, buildInboundLinkCounts, completedPages } from '@/lib/technical-seo/evidence'
import type { AnalyzerContext } from '@/lib/technical-seo/context'
import { makeEvidence, makePage } from './helpers/technical-seo-fixtures'
import type { CrawlEvidence } from '@/lib/technical-seo/evidence'

function contextFor(evidence: CrawlEvidence): AnalyzerContext {
  return { pageIndex: buildPageIndex(evidence), inboundLinkCounts: buildInboundLinkCounts(evidence), totalAnalyzedPages: completedPages(evidence).length }
}

describe('analyzeHreflang', () => {
  it('does not penalize a site with no hreflang usage at all (the overwhelming majority of sites)', () => {
    const evidence = makeEvidence({ pages: [makePage({ url: 'https://example.com/', hreflang_tags: [] })] })
    expect(analyzeHreflang(evidence, contextFor(evidence))).toEqual([])
  })

  it('flags an invalid hreflang code', () => {
    const evidence = makeEvidence({
      pages: [makePage({ url: 'https://example.com/en', hreflang_tags: [{ lang: 'not_a_real_code_!!', href: 'https://example.com/fr' }] })],
    })
    const findings = analyzeHreflang(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'hreflang_invalid_code')).toBeDefined()
  })

  it('accepts common valid codes including region variants and x-default', () => {
    const evidence = makeEvidence({
      pages: [
        makePage({
          url: 'https://example.com/en',
          hreflang_tags: [
            { lang: 'en', href: 'https://example.com/en' },
            { lang: 'en-US', href: 'https://example.com/en-us' },
            { lang: 'x-default', href: 'https://example.com/' },
          ],
        }),
      ],
    })
    const findings = analyzeHreflang(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'hreflang_invalid_code')).toBeUndefined()
  })

  it('flags an hreflang tag pointing to a target that errored in this same crawl', () => {
    const source = makePage({ url: 'https://example.com/en', hreflang_tags: [{ lang: 'fr', href: 'https://example.com/fr' }] })
    const target = makePage({ url: 'https://example.com/fr', http_status: 404 })
    const evidence = makeEvidence({ pages: [source, target] })
    const findings = analyzeHreflang(evidence, contextFor(evidence))
    expect(findings.find((f) => f.checkKey === 'hreflang_target_error')).toBeDefined()
  })

  it('flags a missing reciprocal relationship when the target does not link back', () => {
    const source = makePage({ url: 'https://example.com/en', hreflang_tags: [{ lang: 'fr', href: 'https://example.com/fr' }] })
    const target = makePage({ url: 'https://example.com/fr', hreflang_tags: [] })
    const evidence = makeEvidence({ pages: [source, target] })
    const findings = analyzeHreflang(evidence, contextFor(evidence))
    const finding = findings.find((f) => f.checkKey === 'hreflang_missing_reciprocal')
    expect(finding).toBeDefined()
    expect(finding?.confidence).toBe('medium') // never shown as a certainty — reciprocal setups are sometimes intentional
  })

  it('does not flag a genuinely reciprocal hreflang relationship (false-positive boundary)', () => {
    const source = makePage({ url: 'https://example.com/en', hreflang_tags: [{ lang: 'fr', href: 'https://example.com/fr' }] })
    const target = makePage({ url: 'https://example.com/fr', hreflang_tags: [{ lang: 'en', href: 'https://example.com/en' }] })
    const evidence = makeEvidence({ pages: [source, target] })
    expect(analyzeHreflang(evidence, contextFor(evidence))).toEqual([])
  })

  it('does not claim a target error for a target outside this crawl\'s own evidence', () => {
    const source = makePage({ url: 'https://example.com/en', hreflang_tags: [{ lang: 'de', href: 'https://example.com/de' }] })
    const evidence = makeEvidence({ pages: [source] })
    expect(analyzeHreflang(evidence, contextFor(evidence))).toEqual([])
  })
})
