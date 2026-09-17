import { describe, expect, it } from 'vitest'
import { analyzeMetaDescriptionLength } from '@/lib/on-page/checks/meta-description'
import { analyzeDuplicateMetaDescriptions } from '@/lib/on-page/checks/duplicate-meta-description'
import { isOnPageEligiblePage } from '@/lib/on-page/eligibility'
import type { AnalyzerContext } from '@/lib/on-page/context'
import { makePage } from './helpers/architecture-fixtures'
import type { CrawlPageRow } from '@/lib/crawler/types'

function contextFor(pages: CrawlPageRow[], isPartialCrawl = false): AnalyzerContext {
  return { eligiblePages: pages.filter(isOnPageEligiblePage), totalAnalyzedPages: pages.filter((p) => p.status === 'completed').length, isPartialCrawl }
}

describe('analyzeMetaDescriptionLength', () => {
  it('flags a page with no meta description as missing_meta_description', () => {
    const page = makePage({ url: 'https://example.com/', meta_description: null })
    const finding = analyzeMetaDescriptionLength(contextFor([page])).find((f) => f.checkKey === 'missing_meta_description')
    expect(finding).toBeDefined()
    expect(finding?.baseSeverity).toBe('medium')
  })

  it('flags a description under 70 characters as too_short', () => {
    const page = makePage({ url: 'https://example.com/', meta_description: 'Too short.' })
    expect(analyzeMetaDescriptionLength(contextFor([page])).find((f) => f.checkKey === 'meta_description_too_short')).toBeDefined()
  })

  it('flags a description over 160 characters as too_long', () => {
    const page = makePage({ url: 'https://example.com/', meta_description: 'A'.repeat(170) })
    expect(analyzeMetaDescriptionLength(contextFor([page])).find((f) => f.checkKey === 'meta_description_too_long')).toBeDefined()
  })

  it('does not flag a description within the recommended range', () => {
    const page = makePage({ url: 'https://example.com/', meta_description: 'A'.repeat(100) })
    expect(analyzeMetaDescriptionLength(contextFor([page]))).toEqual([])
  })

  it('does not evaluate an ineligible page', () => {
    const page = makePage({ url: 'https://example.com/utility', meta_description: null, noindex: true })
    expect(analyzeMetaDescriptionLength(contextFor([page]))).toEqual([])
  })

  it('is NOT suppressed on a partial crawl', () => {
    const page = makePage({ url: 'https://example.com/', meta_description: null })
    expect(analyzeMetaDescriptionLength(contextFor([page], true)).find((f) => f.checkKey === 'missing_meta_description')).toBeDefined()
  })
})

describe('analyzeDuplicateMetaDescriptions', () => {
  it('flags two pages sharing the exact same description', () => {
    const description = 'A'.repeat(100)
    const pages = [makePage({ url: 'https://example.com/a', meta_description: description }), makePage({ url: 'https://example.com/b', meta_description: description })]
    const finding = analyzeDuplicateMetaDescriptions(contextFor(pages)).find((f) => f.checkKey === 'duplicate_meta_description')
    expect(finding).toBeDefined()
    expect(finding?.baseSeverity).toBe('medium')
    expect(finding?.affectedPages).toHaveLength(2)
  })

  it('does not flag unique descriptions', () => {
    const pages = [
      makePage({ url: 'https://example.com/a', meta_description: 'A'.repeat(100) }),
      makePage({ url: 'https://example.com/b', meta_description: 'B'.repeat(100) }),
    ]
    expect(analyzeDuplicateMetaDescriptions(contextFor(pages))).toEqual([])
  })

  it('does not group multiple MISSING descriptions as duplicates', () => {
    const pages = [makePage({ url: 'https://example.com/a', meta_description: null }), makePage({ url: 'https://example.com/b', meta_description: null })]
    expect(analyzeDuplicateMetaDescriptions(contextFor(pages))).toEqual([])
  })

  it('is duplicate-resistant: one instance per page, not per pair', () => {
    const description = 'A'.repeat(100)
    const pages = Array.from({ length: 15 }, (_, i) => makePage({ url: `https://example.com/p${i}`, meta_description: description }))
    const finding = analyzeDuplicateMetaDescriptions(contextFor(pages)).find((f) => f.checkKey === 'duplicate_meta_description')
    expect(finding?.affectedPages).toHaveLength(15)
  })
})
