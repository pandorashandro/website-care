import { describe, expect, it } from 'vitest'
import { analyzeThinContent } from '@/lib/content/checks/thin-content'
import { isContentEligiblePage, getExtractionConfidence } from '@/lib/content/eligibility'
import { classifyPageType } from '@/lib/content/page-purpose'
import { hasLikelyAuxiliaryUrlSignal } from '@/lib/category-engine/eligibility'
import type { AnalyzerContext } from '@/lib/content/context'
import { makePage } from './helpers/architecture-fixtures'
import type { CrawlPageRow } from '@/lib/crawler/types'

function contextFor(pages: CrawlPageRow[], isPartialCrawl = false): AnalyzerContext {
  return {
    eligiblePages: pages.filter(isContentEligiblePage).map((page) => ({
      page,
      pageType: classifyPageType(page, page.depth === 0),
      extractionConfidence: getExtractionConfidence(page),
      hasAuxiliaryUrlSignal: hasLikelyAuxiliaryUrlSignal(page),
    })),
    totalAnalyzedPages: pages.filter((p) => p.status === 'completed').length,
    isPartialCrawl,
  }
}

describe('analyzeThinContent — context-aware thresholds', () => {
  it('flags an unknown-type page below the 150-word general threshold', () => {
    const page = makePage({ url: 'https://example.com/our-approach', content_word_count: 80 })
    const finding = analyzeThinContent(contextFor([page])).find((f) => f.checkKey === 'substantively_thin_page')
    expect(finding).toBeDefined()
    expect(finding?.confidence).toBe('medium') // unknown page type -> reduced confidence, not aggressive claim
  })

  it('does NOT flag a 45-word contact page — contact pages have a much lower expectation (40 words)', () => {
    const page = makePage({ url: 'https://example.com/contact', title: 'Contact Us', content_word_count: 45 })
    expect(analyzeThinContent(contextFor([page]))).toEqual([])
  })

  it('DOES flag a 45-word page that is NOT classified as contact (same word count, different context)', () => {
    const page = makePage({ url: 'https://example.com/our-approach', title: 'Our Approach', content_word_count: 45 })
    const finding = analyzeThinContent(contextFor([page])).find((f) => f.checkKey === 'substantively_thin_page')
    expect(finding).toBeDefined()
  })

  it('does not flag a 65-word homepage — homepages have a lower expectation (60 words)', () => {
    const page = makePage({ url: 'https://example.com/', depth: 0, content_word_count: 65 })
    expect(analyzeThinContent(contextFor([page]))).toEqual([])
  })

  it('flags a homepage below its own 60-word threshold', () => {
    const page = makePage({ url: 'https://example.com/', depth: 0, content_word_count: 30 })
    expect(analyzeThinContent(contextFor([page]))).toHaveLength(1)
  })

  it('does not flag a page at or above its threshold', () => {
    const page = makePage({ url: 'https://example.com/services', content_word_count: 150 })
    expect(analyzeThinContent(contextFor([page]))).toEqual([])
  })

  it('EXCLUDES a page with low extraction confidence entirely, rather than reporting "thin" at reduced confidence — a real Bespoke crawl proved a softened confidence label still reads as a confident "0 words" claim', () => {
    const page = makePage({
      url: 'https://example.com/contact',
      title: 'Contact Us',
      content_word_count: 10,
      response_size_bytes: 90_000, // large HTML, tiny extracted text -> suspicious -> low extraction confidence
    })
    const findings = analyzeThinContent(contextFor([page]))
    expect(findings.find((f) => f.checkKey === 'substantively_thin_page' && f.affectedPages.some((p) => p.url === page.url))).toBeUndefined()
  })

  it('does not exclude a page with high extraction confidence merely because it is also thin', () => {
    const page = makePage({ url: 'https://example.com/contact', title: 'Contact Us', content_word_count: 10, response_size_bytes: 5_000 })
    const finding = analyzeThinContent(contextFor([page])).find((f) => f.checkKey === 'substantively_thin_page')
    expect(finding).toBeDefined()
  })

  it('does not evaluate an ineligible page', () => {
    const page = makePage({ url: 'https://example.com/utility', content_word_count: 5, noindex: true })
    expect(analyzeThinContent(contextFor([page]))).toEqual([])
  })

  it('is NOT suppressed on a partial crawl', () => {
    const page = makePage({ url: 'https://example.com/services', content_word_count: 20 })
    expect(analyzeThinContent(contextFor([page], true))).toHaveLength(1)
  })
})

/**
 * Scoring Engine V1 calibration (2026-09-24) — a page barely below its own
 * page-type threshold and a page with almost no content at all were
 * previously reported as the identical flat 'medium' severity. Root cause
 * of a reported ~94 placeholder-site score: with only 1-2 real deductions
 * possible, a flat medium severity left too little room for genuinely
 * extreme thinness to be distinguished from a page that just barely missed
 * the bar. See CRITICALLY_THIN_FRACTION's own doc comment.
 */
describe('analyzeThinContent — severity escalation for EXTREME thinness', () => {
  it('a page just under its page-type threshold is "medium" base severity — barely short, not "critically" thin', () => {
    // homepage threshold is 60 words; 55 is just under it, well above half (30)
    const page = makePage({ url: 'https://example.com/', depth: 0, content_word_count: 55 })
    const finding = analyzeThinContent(contextFor([page])).find((f) => f.checkKey === 'substantively_thin_page')
    expect(finding?.baseSeverity).toBe('medium')
  })

  it('a page under HALF its page-type threshold is "high" base severity — categorically worse than "just short"', () => {
    // homepage threshold is 60 words; 20 is under half (30)
    const page = makePage({ url: 'https://example.com/', depth: 0, content_word_count: 20 })
    const finding = analyzeThinContent(contextFor([page])).find((f) => f.checkKey === 'substantively_thin_page')
    expect(finding?.baseSeverity).toBe('high')
  })

  it('exactly at the halfway point is treated as the less severe (moderate) tier, not critical — the boundary is inclusive on the lenient side', () => {
    // homepage threshold 60, half is exactly 30
    const page = makePage({ url: 'https://example.com/', depth: 0, content_word_count: 30 })
    const finding = analyzeThinContent(contextFor([page])).find((f) => f.checkKey === 'substantively_thin_page')
    expect(finding?.baseSeverity).toBe('medium')
  })

  it('produces two distinct-severity findings when a mix of moderately-thin and critically-thin pages both exist', () => {
    const moderatelyThin = makePage({ url: 'https://example.com/', depth: 0, content_word_count: 45 }) // homepage threshold 60, half 30; 45 is between them
    const criticallyThin = makePage({ url: 'https://example.com/contact', title: 'Contact Us', content_word_count: 5 }) // contact threshold 40, half 20; 5 is well under
    const findings = analyzeThinContent(contextFor([moderatelyThin, criticallyThin]))
    const severities = findings.map((f) => f.baseSeverity).sort()
    expect(severities).toEqual(['high', 'medium'])
    expect(findings.every((f) => f.checkKey === 'substantively_thin_page')).toBe(true)
  })
})
