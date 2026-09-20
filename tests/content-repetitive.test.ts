import { describe, expect, it } from 'vitest'
import { analyzeHighlyRepetitivePages } from '@/lib/content/checks/repetitive'
import { computeBoilerplateParagraphs } from '@/lib/content/boilerplate'
import { contentContextFor } from './helpers/content-fixtures'
import { makePage } from './helpers/architecture-fixtures'
import type { CrawlPageRow } from '@/lib/crawler/types'

const BOILERPLATE_PARAGRAPH = 'Contact us today to schedule a free consultation with our experienced team of specialists.'

function normalPage(index: number) {
  return makePage({
    url: `https://example.com/normal-${index}`,
    content_text: [BOILERPLATE_PARAGRAPH, `Unique content specific to page ${index} describing its own particular topic in detail.`, `A second unique paragraph for page ${index} with more page-specific information.`].join('\n\n'),
    content_paragraph_count: 3,
  })
}

function repetitivePage(overrides: Partial<CrawlPageRow> = {}) {
  return makePage({
    url: 'https://example.com/repetitive',
    content_text: [BOILERPLATE_PARAGRAPH, BOILERPLATE_PARAGRAPH, BOILERPLATE_PARAGRAPH].join('\n\n'),
    content_paragraph_count: 3,
    ...overrides,
  })
}

describe('computeBoilerplateParagraphs', () => {
  it('requires a minimum sample size before classifying anything as boilerplate', () => {
    const pages = Array.from({ length: 3 }, (_, i) => normalPage(i))
    const eligiblePages = contentContextFor(pages).eligiblePages
    expect(computeBoilerplateParagraphs(eligiblePages).size).toBe(0)
  })

  it('classifies a paragraph shared across a sufficient fraction of enough pages as boilerplate', () => {
    const pages = Array.from({ length: 5 }, (_, i) => normalPage(i))
    const eligiblePages = contentContextFor(pages).eligiblePages
    const boilerplate = computeBoilerplateParagraphs(eligiblePages)
    expect(boilerplate.has(BOILERPLATE_PARAGRAPH.toLowerCase())).toBe(true)
  })
})

describe('analyzeHighlyRepetitivePages', () => {
  it('flags a page whose paragraphs are almost entirely shared boilerplate', () => {
    const pages = [...Array.from({ length: 5 }, (_, i) => normalPage(i)), repetitivePage()]
    const finding = analyzeHighlyRepetitivePages(contentContextFor(pages)).find((f) => f.checkKey === 'highly_repetitive_page')
    expect(finding).toBeDefined()
    expect(finding?.affectedPages.map((p) => p.url)).toEqual(['https://example.com/repetitive'])
  })

  it('does not flag pages that mostly contain their own unique content (normal template repetition is not duplication)', () => {
    const pages = Array.from({ length: 6 }, (_, i) => normalPage(i))
    expect(analyzeHighlyRepetitivePages(contentContextFor(pages))).toEqual([])
  })

  it('does not flag a page below the minimum paragraph count, even if 100% boilerplate — that is thin-content\'s job', () => {
    const pages = [...Array.from({ length: 5 }, (_, i) => normalPage(i)), makePage({ url: 'https://example.com/tiny', content_text: BOILERPLATE_PARAGRAPH, content_paragraph_count: 1 })]
    expect(analyzeHighlyRepetitivePages(contentContextFor(pages))).toEqual([])
  })

  it('is NOT suppressed on a partial crawl', () => {
    const pages = [...Array.from({ length: 5 }, (_, i) => normalPage(i)), repetitivePage()]
    expect(analyzeHighlyRepetitivePages(contentContextFor(pages, true))).toHaveLength(1)
  })

  it('REAL-WORLD FALSE-POSITIVE PROTECTION: downgrades confidence to low when every flagged page is link-discovered with a query string', () => {
    const pages = [
      ...Array.from({ length: 5 }, (_, i) => normalPage(i)),
      repetitivePage({ url: 'https://example.com/repetitive?template=preview', discovered_via: 'link' }),
    ]
    const finding = analyzeHighlyRepetitivePages(contentContextFor(pages)).find((f) => f.checkKey === 'highly_repetitive_page')
    expect(finding?.confidence).toBe('low')
    expect(finding?.evidence.includesOnlyLikelyAuxiliaryPages).toBe(true)
  })

  it('keeps medium confidence when the flagged page is not link-discovered-with-query-string', () => {
    const pages = [...Array.from({ length: 5 }, (_, i) => normalPage(i)), repetitivePage()]
    const finding = analyzeHighlyRepetitivePages(contentContextFor(pages)).find((f) => f.checkKey === 'highly_repetitive_page')
    expect(finding?.confidence).toBe('medium')
    expect(finding?.evidence.includesOnlyLikelyAuxiliaryPages).toBe(false)
  })
})
