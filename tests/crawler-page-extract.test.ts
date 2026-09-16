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

  describe('structured data (Phase 26B)', () => {
    it('detects a page with no JSON-LD as absent, not invalid', () => {
      const result = extractPageMetadata('<html><head></head></html>', 'https://example.com/page', null)
      expect(result.structuredDataPresent).toBe(false)
      expect(result.structuredDataValid).toBeNull()
      expect(result.structuredDataError).toBeNull()
    })

    it('detects valid JSON-LD', () => {
      const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme"}</script>`
      const result = extractPageMetadata(html, 'https://example.com/page', null)
      expect(result.structuredDataPresent).toBe(true)
      expect(result.structuredDataValid).toBe(true)
      expect(result.structuredDataError).toBeNull()
    })

    it('detects invalid (malformed) JSON-LD', () => {
      const html = `<script type="application/ld+json">{"@type": "Organization", "name": }</script>`
      const result = extractPageMetadata(html, 'https://example.com/page', null)
      expect(result.structuredDataPresent).toBe(true)
      expect(result.structuredDataValid).toBe(false)
      expect(result.structuredDataError).not.toBeNull()
    })

    it('treats multiple valid blocks as valid overall', () => {
      const html = `
        <script type="application/ld+json">{"@type":"Organization"}</script>
        <script type="application/ld+json">{"@type":"WebSite"}</script>
      `
      const result = extractPageMetadata(html, 'https://example.com/page', null)
      expect(result.structuredDataValid).toBe(true)
    })
  })

  describe('hreflang (Phase 26B)', () => {
    it('extracts hreflang tags and resolves relative hrefs to absolute URLs', () => {
      const html = `<html><head><link rel="alternate" hreflang="fr" href="/fr/page"></head></html>`
      const result = extractPageMetadata(html, 'https://example.com/page', null)
      expect(result.hreflangTags).toEqual([{ lang: 'fr', href: 'https://example.com/fr/page' }])
    })

    it('returns an empty array when no hreflang tags are present (the common case)', () => {
      const result = extractPageMetadata('<html><head></head></html>', 'https://example.com/page', null)
      expect(result.hreflangTags).toEqual([])
    })

    it('ignores an alternate link with no hreflang attribute', () => {
      const html = `<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head></html>`
      const result = extractPageMetadata(html, 'https://example.com/page', null)
      expect(result.hreflangTags).toEqual([])
    })
  })
})
