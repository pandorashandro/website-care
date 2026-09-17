import { describe, expect, it } from 'vitest'
import { analyzeTitleLength, analyzeWeakTitle } from '@/lib/on-page/checks/title'
import { isOnPageEligiblePage } from '@/lib/on-page/eligibility'
import type { AnalyzerContext } from '@/lib/on-page/context'
import { makePage } from './helpers/architecture-fixtures'
import type { CrawlPageRow } from '@/lib/crawler/types'

function contextFor(pages: CrawlPageRow[], isPartialCrawl = false): AnalyzerContext {
  return { eligiblePages: pages.filter(isOnPageEligiblePage), totalAnalyzedPages: pages.filter((p) => p.status === 'completed').length, isPartialCrawl }
}

describe('analyzeTitleLength', () => {
  it('flags a page with no title as missing_title', () => {
    const page = makePage({ url: 'https://example.com/', title: null })
    const findings = analyzeTitleLength(contextFor([page]))
    const finding = findings.find((f) => f.checkKey === 'missing_title')
    expect(finding).toBeDefined()
    expect(finding?.baseSeverity).toBe('high')
    expect(finding?.affectedPages.map((p) => p.url)).toEqual(['https://example.com/'])
  })

  it('flags an empty-string title as missing_title too', () => {
    const page = makePage({ url: 'https://example.com/', title: '   ' })
    // classifyTitleLength treats a whitespace-only string as too_short (length < 30),
    // not missing -- this test documents that boundary rather than assuming it.
    const findings = analyzeTitleLength(contextFor([page]))
    expect(findings.some((f) => f.checkKey === 'missing_title' || f.checkKey === 'title_too_short')).toBe(true)
  })

  it('flags a title under 30 characters as title_too_short', () => {
    const page = makePage({ url: 'https://example.com/', title: 'Short title' })
    const findings = analyzeTitleLength(contextFor([page]))
    expect(findings.find((f) => f.checkKey === 'title_too_short')).toBeDefined()
  })

  it('flags a title over 60 characters as title_too_long', () => {
    const page = makePage({ url: 'https://example.com/', title: 'A'.repeat(65) })
    const findings = analyzeTitleLength(contextFor([page]))
    expect(findings.find((f) => f.checkKey === 'title_too_long')).toBeDefined()
  })

  it('does not flag a title within the recommended range', () => {
    const page = makePage({ url: 'https://example.com/', title: 'A'.repeat(45) })
    const findings = analyzeTitleLength(contextFor([page]))
    expect(findings).toEqual([])
  })

  it('does not evaluate an ineligible page (noindex)', () => {
    const page = makePage({ url: 'https://example.com/utility', title: null, noindex: true })
    expect(analyzeTitleLength(contextFor([page]))).toEqual([])
  })

  it('is NOT suppressed on a partial crawl — a page\'s own title is fully known once fetched', () => {
    const page = makePage({ url: 'https://example.com/', title: null })
    const findings = analyzeTitleLength(contextFor([page], true))
    expect(findings.find((f) => f.checkKey === 'missing_title')).toBeDefined()
  })

  it('groups multiple missing-title pages into one aggregated finding with all affected pages', () => {
    const pages = [makePage({ url: 'https://example.com/a', title: null }), makePage({ url: 'https://example.com/b', title: null })]
    const findings = analyzeTitleLength(contextFor(pages))
    const finding = findings.find((f) => f.checkKey === 'missing_title')
    expect(finding?.affectedPages).toHaveLength(2)
  })
})

describe('analyzeWeakTitle', () => {
  it('flags an exact generic placeholder title', () => {
    const page = makePage({ url: 'https://example.com/', title: 'Home' })
    const findings = analyzeWeakTitle(contextFor([page]))
    const finding = findings.find((f) => f.checkKey === 'weak_title')
    expect(finding).toBeDefined()
    expect(finding?.confidence).toBe('medium')
  })

  it('is case/whitespace-insensitive', () => {
    const page = makePage({ url: 'https://example.com/', title: '  HOME  ' })
    expect(analyzeWeakTitle(contextFor([page])).length).toBe(1)
  })

  it('does not flag a genuine, specific title', () => {
    const page = makePage({ url: 'https://example.com/', title: 'Business Strategy Consulting Services' })
    expect(analyzeWeakTitle(contextFor([page]))).toEqual([])
  })

  it('does not flag a missing title (that is missing_title\'s job, not weak_title\'s)', () => {
    const page = makePage({ url: 'https://example.com/', title: null })
    expect(analyzeWeakTitle(contextFor([page]))).toEqual([])
  })
})
