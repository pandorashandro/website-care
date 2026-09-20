import { describe, expect, it } from 'vitest'
import { isContentEligiblePage, getExtractionConfidence } from '@/lib/content/eligibility'
import { hasLikelyAuxiliaryUrlSignal } from '@/lib/category-engine/eligibility'
import { makePage } from './helpers/architecture-fixtures'

/**
 * Phase 29 — ELIGIBILITY coverage: normal eligible page, noindex,
 * cross-canonical, non-HTML, failed, uncertain-but-eligible page,
 * legitimate query page. Base eligibility reuses the identical shared
 * predicate already exhaustively tested in
 * tests/architecture-eligibility.test.ts — this file focuses on the
 * wiring plus Content's own extraction-confidence dimension.
 */
describe('isContentEligiblePage', () => {
  it('a normal, successfully-fetched, indexable, self-canonical HTML page is eligible', () => {
    expect(isContentEligiblePage(makePage({ url: 'https://example.com/solutions' }))).toBe(true)
  })

  it('a page marked noindex is not eligible', () => {
    expect(isContentEligiblePage(makePage({ url: 'https://example.com/utility', noindex: true }))).toBe(false)
  })

  it('a page whose canonical points at a different URL is not eligible', () => {
    const page = makePage({ url: 'https://example.com/utility?x=1', canonical_url: 'https://example.com/real-page' })
    expect(isContentEligiblePage(page)).toBe(false)
  })

  it('a non-HTML resource is not eligible', () => {
    const page = makePage({ url: 'https://example.com/file.pdf', content_type: 'application/pdf' })
    expect(isContentEligiblePage(page)).toBe(false)
  })

  it('a page that failed to fetch is not eligible', () => {
    const page = makePage({ url: 'https://example.com/gone', status: 'failed', http_status: null })
    expect(isContentEligiblePage(page)).toBe(false)
  })

  it('a legitimate query-string page remains eligible', () => {
    const page = makePage({ url: 'https://example.com/products?category=shoes' })
    expect(isContentEligiblePage(page)).toBe(true)
  })
})

describe('getExtractionConfidence', () => {
  it('is "high" for a normal page whose HTML size is proportionate to its extracted text', () => {
    const page = makePage({ url: 'https://example.com/', response_size_bytes: 15_000, content_word_count: 160 })
    expect(getExtractionConfidence(page)).toBe('high')
  })

  it('is "low" for a page with substantial HTML but almost no extracted text — likely client-rendered content this crawler cannot see', () => {
    const page = makePage({ url: 'https://example.com/app-page', response_size_bytes: 80_000, content_word_count: 5 })
    expect(getExtractionConfidence(page)).toBe('low')
  })

  it('an uncertain-but-otherwise-eligible page (small HTML, low word count) is still "high" confidence — small HTML genuinely explaining low text is not suspicious', () => {
    const page = makePage({ url: 'https://example.com/tiny', response_size_bytes: 3_000, content_word_count: 5 })
    expect(getExtractionConfidence(page)).toBe('high')
  })

  it('a page with high word count is "high" confidence regardless of HTML size', () => {
    const page = makePage({ url: 'https://example.com/rich', response_size_bytes: 200_000, content_word_count: 500 })
    expect(getExtractionConfidence(page)).toBe('high')
  })
})

describe('hasLikelyAuxiliaryUrlSignal — real-world false-positive protection (Prompt 3)', () => {
  it('is true only when a page is BOTH link-discovered AND carries a query string', () => {
    const page = makePage({ url: 'https://example.com/preview?template=1', discovered_via: 'link' })
    expect(hasLikelyAuxiliaryUrlSignal(page)).toBe(true)
  })

  it('is false for a link-discovered page with no query string — the vast majority of ordinary internal pages on a site with no sitemap', () => {
    const page = makePage({ url: 'https://example.com/about', discovered_via: 'link' })
    expect(hasLikelyAuxiliaryUrlSignal(page)).toBe(false)
  })

  it('is false for a sitemap-listed page even with a query string — the site owner declared it a real destination', () => {
    const page = makePage({ url: 'https://example.com/products?category=shoes', discovered_via: 'sitemap' })
    expect(hasLikelyAuxiliaryUrlSignal(page)).toBe(false)
  })

  it('is false for the crawl seed page even with a query string', () => {
    const page = makePage({ url: 'https://example.com/?ref=homepage', discovered_via: 'seed' })
    expect(hasLikelyAuxiliaryUrlSignal(page)).toBe(false)
  })

  it('never references any platform, plugin, or specific query parameter name — it is purely discovered_via + presence of "?"', () => {
    const page = makePage({ url: 'https://example.com/x?anything=whatever-key-name', discovered_via: 'link' })
    expect(hasLikelyAuxiliaryUrlSignal(page)).toBe(true)
  })
})
