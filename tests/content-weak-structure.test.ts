import { describe, expect, it } from 'vitest'
import { analyzeWeakContentStructure } from '@/lib/content/checks/weak-structure'
import { contentContextFor } from './helpers/content-fixtures'
import { makePage } from './helpers/architecture-fixtures'

describe('analyzeWeakContentStructure', () => {
  it('flags a page with substantial words but no paragraph breaks or headings', () => {
    const page = makePage({ url: 'https://example.com/wall-of-text', content_word_count: 200, content_paragraph_count: 1, content_heading_texts: [] })
    const finding = analyzeWeakContentStructure(contentContextFor([page])).find((f) => f.checkKey === 'weak_content_structure')
    expect(finding).toBeDefined()
    expect(finding?.confidence).toBe('high')
  })

  it('does not flag a page with multiple paragraphs even with zero headings', () => {
    const page = makePage({ url: 'https://example.com/ok', content_word_count: 200, content_paragraph_count: 4, content_heading_texts: [] })
    expect(analyzeWeakContentStructure(contentContextFor([page]))).toEqual([])
  })

  it('does not flag a page with headings even with just one paragraph', () => {
    const page = makePage({ url: 'https://example.com/ok', content_word_count: 200, content_paragraph_count: 1, content_heading_texts: ['A Section'] })
    expect(analyzeWeakContentStructure(contentContextFor([page]))).toEqual([])
  })

  it('does not flag a genuinely thin page (below the word threshold) — that is thin-content\'s job, not this check\'s', () => {
    const page = makePage({ url: 'https://example.com/thin', content_word_count: 50, content_paragraph_count: 1, content_heading_texts: [] })
    expect(analyzeWeakContentStructure(contentContextFor([page]))).toEqual([])
  })

  it('does not evaluate an ineligible page', () => {
    const page = makePage({ url: 'https://example.com/utility', content_word_count: 200, content_paragraph_count: 1, content_heading_texts: [], noindex: true })
    expect(analyzeWeakContentStructure(contentContextFor([page]))).toEqual([])
  })

  it('NEW SIGNAL: flags a genuinely long page (>= 400 words) with zero section headings, even with many paragraphs — the wall-of-text rule alone would miss this', () => {
    const page = makePage({ url: 'https://example.com/long-no-headings', content_word_count: 500, content_paragraph_count: 8, content_heading_texts: [] })
    const finding = analyzeWeakContentStructure(contentContextFor([page])).find((f) => f.checkKey === 'weak_content_structure')
    expect(finding).toBeDefined()
    expect(finding?.affectedPages[0].detail).toMatchObject({ reason: 'long_content_zero_headings' })
  })

  it('does NOT flag a long page (>= 400 words) that has at least one section heading, however many paragraphs', () => {
    const page = makePage({ url: 'https://example.com/long-with-headings', content_word_count: 500, content_paragraph_count: 8, content_heading_texts: ['Overview'] })
    expect(analyzeWeakContentStructure(contentContextFor([page]))).toEqual([])
  })

  it('does NOT flag a moderately long page just under the long-content threshold with several paragraphs and no headings', () => {
    const page = makePage({ url: 'https://example.com/moderate', content_word_count: 399, content_paragraph_count: 4, content_heading_texts: [] })
    expect(analyzeWeakContentStructure(contentContextFor([page]))).toEqual([])
  })
})
