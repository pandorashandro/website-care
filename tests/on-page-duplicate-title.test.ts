import { describe, expect, it } from 'vitest'
import { analyzeDuplicateTitles } from '@/lib/on-page/checks/duplicate-title'
import { isOnPageEligiblePage } from '@/lib/on-page/eligibility'
import type { AnalyzerContext } from '@/lib/on-page/context'
import { makePage } from './helpers/architecture-fixtures'
import type { CrawlPageRow } from '@/lib/crawler/types'

function contextFor(pages: CrawlPageRow[], isPartialCrawl = false): AnalyzerContext {
  return { eligiblePages: pages.filter(isOnPageEligiblePage), totalAnalyzedPages: pages.filter((p) => p.status === 'completed').length, isPartialCrawl }
}

describe('analyzeDuplicateTitles', () => {
  it('flags two pages sharing the exact same title', () => {
    const pages = [makePage({ url: 'https://example.com/a', title: 'Our Services' }), makePage({ url: 'https://example.com/b', title: 'Our Services' })]
    const findings = analyzeDuplicateTitles(contextFor(pages))
    const finding = findings.find((f) => f.checkKey === 'duplicate_title')
    expect(finding).toBeDefined()
    expect(finding?.affectedPages).toHaveLength(2)
  })

  it('is case- and whitespace-insensitive for grouping', () => {
    const pages = [makePage({ url: 'https://example.com/a', title: 'Our Services' }), makePage({ url: 'https://example.com/b', title: '  our services  ' })]
    expect(analyzeDuplicateTitles(contextFor(pages))).toHaveLength(1)
  })

  it('does not flag pages with unique titles', () => {
    const pages = [makePage({ url: 'https://example.com/a', title: 'Page A' }), makePage({ url: 'https://example.com/b', title: 'Page B' })]
    expect(analyzeDuplicateTitles(contextFor(pages))).toEqual([])
  })

  it('does not group multiple MISSING titles as if they were duplicates of each other', () => {
    const pages = [makePage({ url: 'https://example.com/a', title: null }), makePage({ url: 'https://example.com/b', title: null })]
    expect(analyzeDuplicateTitles(contextFor(pages))).toEqual([])
  })

  it('is duplicate-resistant: one evidence instance per PAGE, never per pair (no combinatorial explosion)', () => {
    const pages = Array.from({ length: 20 }, (_, i) => makePage({ url: `https://example.com/p${i}`, title: 'Shared Title' }))
    const finding = analyzeDuplicateTitles(contextFor(pages)).find((f) => f.checkKey === 'duplicate_title')
    expect(finding?.affectedPages).toHaveLength(20) // NOT C(20,2) = 190
  })

  it('reports distinct duplicate GROUP count via affectedResourceUrl, not just total affected pages', () => {
    const pages = [
      makePage({ url: 'https://example.com/a1', title: 'Group A' }),
      makePage({ url: 'https://example.com/a2', title: 'Group A' }),
      makePage({ url: 'https://example.com/b1', title: 'Group B' }),
      makePage({ url: 'https://example.com/b2', title: 'Group B' }),
    ]
    const finding = analyzeDuplicateTitles(contextFor(pages)).find((f) => f.checkKey === 'duplicate_title')
    const distinctGroups = new Set(finding?.affectedPages.map((p) => p.affectedResourceUrl))
    expect(distinctGroups.size).toBe(2)
  })

  it('is NOT suppressed on a partial crawl — an observed duplicate within analyzed pages is still a true fact', () => {
    const pages = [makePage({ url: 'https://example.com/a', title: 'Same' }), makePage({ url: 'https://example.com/b', title: 'Same' })]
    expect(analyzeDuplicateTitles(contextFor(pages, true))).toHaveLength(1)
  })

  it('excludes ineligible pages from duplicate-group consideration', () => {
    const pages = [
      makePage({ url: 'https://example.com/a', title: 'Same' }),
      makePage({ url: 'https://example.com/utility', title: 'Same', noindex: true }),
    ]
    expect(analyzeDuplicateTitles(contextFor(pages))).toEqual([])
  })
})
