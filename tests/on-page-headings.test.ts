import { describe, expect, it } from 'vitest'
import { analyzeHeadingStructure } from '@/lib/on-page/checks/headings'
import { isOnPageEligiblePage } from '@/lib/on-page/eligibility'
import type { AnalyzerContext } from '@/lib/on-page/context'
import { makePage } from './helpers/architecture-fixtures'
import type { CrawlPageRow } from '@/lib/crawler/types'

function contextFor(pages: CrawlPageRow[], isPartialCrawl = false): AnalyzerContext {
  return { eligiblePages: pages.filter(isOnPageEligiblePage), totalAnalyzedPages: pages.filter((p) => p.status === 'completed').length, isPartialCrawl }
}

describe('analyzeHeadingStructure — missing_h1', () => {
  it('flags a page with zero H1 elements', () => {
    const page = makePage({ url: 'https://example.com/', h1_text: null, h1_count: 0 })
    const finding = analyzeHeadingStructure(contextFor([page])).find((f) => f.checkKey === 'missing_h1')
    expect(finding).toBeDefined()
    expect(finding?.baseSeverity).toBe('medium')
  })

  it('flags a page whose single H1 is empty/whitespace-only text', () => {
    const page = makePage({ url: 'https://example.com/', h1_text: '   ', h1_count: 1 })
    expect(analyzeHeadingStructure(contextFor([page])).find((f) => f.checkKey === 'missing_h1')).toBeDefined()
  })

  it('does not flag a page with one meaningful H1', () => {
    const page = makePage({ url: 'https://example.com/', h1_text: 'Welcome to Our Site', h1_count: 1 })
    expect(analyzeHeadingStructure(contextFor([page])).find((f) => f.checkKey === 'missing_h1')).toBeUndefined()
  })

  it('is NOT suppressed on a partial crawl', () => {
    const page = makePage({ url: 'https://example.com/', h1_text: null, h1_count: 0 })
    expect(analyzeHeadingStructure(contextFor([page], true)).find((f) => f.checkKey === 'missing_h1')).toBeDefined()
  })

  it('does not evaluate an ineligible page', () => {
    const page = makePage({ url: 'https://example.com/utility', h1_text: null, h1_count: 0, noindex: true })
    expect(analyzeHeadingStructure(contextFor([page]))).toEqual([])
  })
})

describe('analyzeHeadingStructure — multiple_h1', () => {
  it('flags a page with 2 or more H1 elements, regardless of the first one\'s text', () => {
    const page = makePage({ url: 'https://example.com/', h1_text: 'Main Heading', h1_count: 3 })
    const finding = analyzeHeadingStructure(contextFor([page])).find((f) => f.checkKey === 'multiple_h1')
    expect(finding).toBeDefined()
    expect(finding?.affectedPages[0].currentState?.value).toBe('3')
  })

  it('does not flag a page with exactly one H1', () => {
    const page = makePage({ url: 'https://example.com/', h1_text: 'Main Heading', h1_count: 1 })
    expect(analyzeHeadingStructure(contextFor([page])).find((f) => f.checkKey === 'multiple_h1')).toBeUndefined()
  })

  it('a page can trigger BOTH missing_h1 (empty first H1) and multiple_h1 (2+ H1s) simultaneously', () => {
    const page = makePage({ url: 'https://example.com/', h1_text: '', h1_count: 2 })
    const findings = analyzeHeadingStructure(contextFor([page]))
    expect(findings.find((f) => f.checkKey === 'missing_h1')).toBeDefined()
    expect(findings.find((f) => f.checkKey === 'multiple_h1')).toBeDefined()
  })
})
