import { describe, expect, it } from 'vitest'
import { analyzeExactDuplicateContent } from '@/lib/content/checks/exact-duplicate'
import { contentContextFor } from './helpers/content-fixtures'
import { makePage } from './helpers/architecture-fixtures'

const SUBSTANTIVE_TEXT = 'This is a sufficiently long paragraph of genuinely substantive written content used for testing duplicate detection.'
const OTHER_TEXT = 'This is a completely different, equally substantive paragraph describing something else entirely for this page.'

describe('analyzeExactDuplicateContent', () => {
  it('flags two pages whose content_hash matches (identical substantive text)', () => {
    const a = makePage({ url: 'https://example.com/a', content_text: SUBSTANTIVE_TEXT, content_hash: 'shared-hash' })
    const b = makePage({ url: 'https://example.com/b', content_text: SUBSTANTIVE_TEXT, content_hash: 'shared-hash' })

    const finding = analyzeExactDuplicateContent(contentContextFor([a, b])).find((f) => f.checkKey === 'exact_duplicate_content')
    expect(finding).toBeDefined()
    expect(finding?.affectedPages).toHaveLength(2)
    expect(finding?.baseSeverity).toBe('high')
  })

  it('does not flag pages with different hashes', () => {
    const a = makePage({ url: 'https://example.com/a', content_text: SUBSTANTIVE_TEXT, content_hash: 'hash-a' })
    const b = makePage({ url: 'https://example.com/b', content_text: OTHER_TEXT, content_hash: 'hash-b' })
    expect(analyzeExactDuplicateContent(contentContextFor([a, b]))).toEqual([])
  })

  it('excludes pages with a null content_hash (near-empty pages) from grouping entirely', () => {
    const a = makePage({ url: 'https://example.com/a', content_hash: null })
    const b = makePage({ url: 'https://example.com/b', content_hash: null })
    expect(analyzeExactDuplicateContent(contentContextFor([a, b]))).toEqual([])
  })

  it('is duplicate-resistant: one evidence instance per page, never per pair', () => {
    const pages = Array.from({ length: 15 }, (_, i) => makePage({ url: `https://example.com/p${i}`, content_hash: 'shared-hash' }))
    const finding = analyzeExactDuplicateContent(contentContextFor(pages)).find((f) => f.checkKey === 'exact_duplicate_content')
    expect(finding?.affectedPages).toHaveLength(15) // NOT C(15,2) = 105
  })

  it('reports distinct duplicate GROUP count via uniqueTargetCount-feeding affectedResourceUrl', () => {
    const pages = [
      makePage({ url: 'https://example.com/a1', content_hash: 'group-a' }),
      makePage({ url: 'https://example.com/a2', content_hash: 'group-a' }),
      makePage({ url: 'https://example.com/b1', content_hash: 'group-b' }),
      makePage({ url: 'https://example.com/b2', content_hash: 'group-b' }),
    ]
    const finding = analyzeExactDuplicateContent(contentContextFor(pages)).find((f) => f.checkKey === 'exact_duplicate_content')
    const distinctGroups = new Set(finding?.affectedPages.map((p) => p.affectedResourceUrl))
    expect(distinctGroups.size).toBe(2)
  })

  it('is NOT suppressed on a partial crawl', () => {
    const a = makePage({ url: 'https://example.com/a', content_hash: 'shared-hash' })
    const b = makePage({ url: 'https://example.com/b', content_hash: 'shared-hash' })
    expect(analyzeExactDuplicateContent(contentContextFor([a, b], true))).toHaveLength(1)
  })

  it('excludes ineligible pages from duplicate grouping', () => {
    const a = makePage({ url: 'https://example.com/a', content_hash: 'shared-hash' })
    const b = makePage({ url: 'https://example.com/utility', content_hash: 'shared-hash', noindex: true })
    expect(analyzeExactDuplicateContent(contentContextFor([a, b]))).toEqual([])
  })

  it('exposes group-level evidence (group count, per-group URLs and size) and states the exact-match-only scope in its own explanation', () => {
    const pages = [
      makePage({ url: 'https://example.com/a1', content_hash: 'group-a' }),
      makePage({ url: 'https://example.com/a2', content_hash: 'group-a' }),
      makePage({ url: 'https://example.com/b1', content_hash: 'group-b' }),
      makePage({ url: 'https://example.com/b2', content_hash: 'group-b' }),
    ]
    const finding = analyzeExactDuplicateContent(contentContextFor(pages)).find((f) => f.checkKey === 'exact_duplicate_content')
    expect(finding?.evidence).toMatchObject({ duplicateGroupCount: 2, affectedPageCount: 4 })
    expect(finding?.explanation).toContain('EXACT-match')
  })

  it('REAL-WORLD FALSE-POSITIVE PROTECTION: downgrades confidence to medium when a duplicate group is made up entirely of link-discovered, query-string pages', () => {
    const a = makePage({
      url: 'https://example.com/page?template=preview-1',
      content_hash: 'shared-hash',
      discovered_via: 'link',
    })
    const b = makePage({
      url: 'https://example.com/page?template=preview-2',
      content_hash: 'shared-hash',
      discovered_via: 'link',
    })
    const finding = analyzeExactDuplicateContent(contentContextFor([a, b])).find((f) => f.checkKey === 'exact_duplicate_content')
    expect(finding?.confidence).toBe('medium')
    expect(finding?.evidence.includesLikelyAuxiliaryGroup).toBe(true)
  })

  it('keeps high confidence when at least one page in the duplicate group is NOT link-discovered-with-query-string', () => {
    const a = makePage({ url: 'https://example.com/about', content_hash: 'shared-hash', discovered_via: 'sitemap' })
    const b = makePage({ url: 'https://example.com/about-us', content_hash: 'shared-hash', discovered_via: 'link' })
    const finding = analyzeExactDuplicateContent(contentContextFor([a, b])).find((f) => f.checkKey === 'exact_duplicate_content')
    expect(finding?.confidence).toBe('high')
    expect(finding?.evidence.includesLikelyAuxiliaryGroup).toBe(false)
  })

  it('does not downgrade confidence for a query-string page that was discovered via the sitemap (only ONE signal present, not both)', () => {
    const a = makePage({ url: 'https://example.com/product?variant=1', content_hash: 'shared-hash', discovered_via: 'sitemap' })
    const b = makePage({ url: 'https://example.com/product?variant=2', content_hash: 'shared-hash', discovered_via: 'sitemap' })
    const finding = analyzeExactDuplicateContent(contentContextFor([a, b])).find((f) => f.checkKey === 'exact_duplicate_content')
    expect(finding?.confidence).toBe('high')
  })
})
