import { describe, expect, it } from 'vitest'
import { analyzePagePurposeSummary } from '@/lib/content/checks/page-purpose-summary'
import { contentContextFor } from './helpers/content-fixtures'
import { makePage } from './helpers/architecture-fixtures'

describe('analyzePagePurposeSummary', () => {
  it('is kind "opportunity" — Page Purpose never reduces Content Health', () => {
    const page = makePage({ url: 'https://example.com/' })
    const finding = analyzePagePurposeSummary(contentContextFor([page])).find((f) => f.checkKey === 'page_purpose_summary')
    expect(finding?.kind).toBe('opportunity')
  })

  it('is emitted unconditionally whenever at least one eligible page exists', () => {
    const page = makePage({ url: 'https://example.com/services' })
    expect(analyzePagePurposeSummary(contentContextFor([page]))).toHaveLength(1)
  })

  it('is NOT emitted when there are zero eligible pages', () => {
    const page = makePage({ url: 'https://example.com/utility', noindex: true })
    expect(analyzePagePurposeSummary(contentContextFor([page]))).toEqual([])
  })

  it('reports accurate homepage/contact/unknown counts', () => {
    const pages = [
      makePage({ url: 'https://example.com/', depth: 0 }),
      makePage({ url: 'https://example.com/contact', title: 'Contact Us' }),
      makePage({ url: 'https://example.com/why-choose-us' }),
    ]
    const finding = analyzePagePurposeSummary(contentContextFor(pages)).find((f) => f.checkKey === 'page_purpose_summary')
    expect(finding?.evidence).toMatchObject({ homepageCount: 1, contactCount: 1, unknownCount: 1, eligiblePageCount: 3 })
  })

  it('reports counts across the expanded taxonomy (service/product/article/about/category)', () => {
    const pages = [
      makePage({ url: 'https://example.com/', depth: 0 }),
      makePage({ url: 'https://example.com/services/digital-marketing' }),
      makePage({ url: 'https://example.com/shop/widget' }),
      makePage({ url: 'https://example.com/blog/my-post' }),
      makePage({ url: 'https://example.com/about-us', title: 'About Our Company' }),
      makePage({ url: 'https://example.com/category/electronics' }),
    ]
    const finding = analyzePagePurposeSummary(contentContextFor(pages)).find((f) => f.checkKey === 'page_purpose_summary')
    expect(finding?.evidence).toMatchObject({
      homepageCount: 1,
      serviceCount: 1,
      productCount: 1,
      articleCount: 1,
      aboutCount: 1,
      categoryCount: 1,
      unknownCount: 0,
      eligiblePageCount: 6,
    })
  })

  it('carries eligiblePageCount and lowExtractionConfidenceCount in evidence — reused by lib/content/dimensions.ts as the analysis-scope record', () => {
    const page = makePage({ url: 'https://example.com/', response_size_bytes: 90_000, content_word_count: 5 })
    const finding = analyzePagePurposeSummary(contentContextFor([page])).find((f) => f.checkKey === 'page_purpose_summary')
    expect(finding?.evidence.lowExtractionConfidenceCount).toBe(1)
    expect(finding?.evidence.eligiblePageCount).toBe(1)
  })

  it('reports high confidence when most pages are classified, low when most are unknown', () => {
    const wellClassified = [makePage({ url: 'https://example.com/', depth: 0 }), makePage({ url: 'https://example.com/contact', title: 'Contact Us' })]
    const mostlyUnknown = [makePage({ url: 'https://example.com/a' }), makePage({ url: 'https://example.com/b' }), makePage({ url: 'https://example.com/c', depth: 0 })]

    const highConf = analyzePagePurposeSummary(contentContextFor(wellClassified))[0]
    const lowConf = analyzePagePurposeSummary(contentContextFor(mostlyUnknown))[0]

    expect(highConf.confidence).toBe('high')
    expect(lowConf.confidence).toBe('low')
  })

  it('is NOT suppressed on a partial crawl', () => {
    const page = makePage({ url: 'https://example.com/' })
    expect(analyzePagePurposeSummary(contentContextFor([page], true))).toHaveLength(1)
  })
})
