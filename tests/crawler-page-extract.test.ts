import { describe, expect, it } from 'vitest'
import { extractPageMetadata } from '@/lib/crawler/page-extract'

describe('extractPageMetadata', () => {
  it('extracts title, meta description, first H1, and canonical', () => {
    const html = `
      <html><head>
        <title>My Page</title>
        <meta name="description" content="A page about things.">
        <link rel="canonical" href="/canonical-path">
      </head><body>
        <h1>First Heading</h1>
        <h1>Second Heading</h1>
      </body></html>
    `
    const result = extractPageMetadata(html, 'https://example.com/page', null)

    expect(result.title).toBe('My Page')
    expect(result.metaDescription).toBe('A page about things.')
    expect(result.h1Text).toBe('First Heading')
    expect(result.canonicalUrl).toBe('https://example.com/canonical-path')
    expect(result.noindex).toBe(false)
  })

  it('returns nulls when metadata is absent', () => {
    const result = extractPageMetadata('<html><body>No head content</body></html>', 'https://example.com/page', null)
    expect(result.title).toBeNull()
    expect(result.metaDescription).toBeNull()
    expect(result.h1Text).toBeNull()
    expect(result.canonicalUrl).toBeNull()
  })

  it('detects noindex from a meta robots tag', () => {
    const html = '<html><head><meta name="robots" content="noindex, nofollow"></head></html>'
    expect(extractPageMetadata(html, 'https://example.com/page', null).noindex).toBe(true)
  })

  it('detects noindex from the X-Robots-Tag header', () => {
    const html = '<html><head></head></html>'
    expect(extractPageMetadata(html, 'https://example.com/page', 'noindex').noindex).toBe(true)
  })
})
