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
    // Phase 28 — h1Count reflects the TOTAL number of <h1> elements, even
    // though h1Text only ever stores the first one's text.
    expect(result.h1Count).toBe(2)
    expect(result.canonicalUrl).toBe('https://example.com/canonical-path')
    expect(result.noindex).toBe(false)
  })

  it('returns nulls when metadata is absent', () => {
    const result = extractPageMetadata('<html><body>No head content</body></html>', 'https://example.com/page', null)
    expect(result.title).toBeNull()
    expect(result.metaDescription).toBeNull()
    expect(result.h1Text).toBeNull()
    expect(result.h1Count).toBe(0)
    expect(result.canonicalUrl).toBeNull()
  })

  it('h1Count is 1 for a page with exactly one H1 (Phase 28)', () => {
    const result = extractPageMetadata('<html><body><h1>Only Heading</h1></body></html>', 'https://example.com/page', null)
    expect(result.h1Text).toBe('Only Heading')
    expect(result.h1Count).toBe(1)
  })

  /**
   * Phase 28 real-world evidence validation, Observations 2 & 3 — ruling
   * out an extraction-selector bug as the explanation for the Bespoke
   * analysis's 30/30 missing-title/H1 findings by verifying the extractors
   * against realistic WordPress/Elementor/Yoast/RankMath-style markup
   * shapes (reversed attribute order, single quotes, self-closing tags,
   * multi-line attributes, heading classes/data attributes) rather than
   * only clean synthetic HTML.
   */
  describe('realistic real-world markup shapes (WordPress/SEO-plugin style)', () => {
    it('extracts a meta description with REVERSED attribute order (content before name) — a common SEO-plugin output shape', () => {
      const html = '<meta content="Reversed attribute order description." name="description">'
      expect(extractPageMetadata(html, 'https://example.com/page', null).metaDescription).toBe('Reversed attribute order description.')
    })

    it('extracts a meta description using single-quoted attributes', () => {
      const html = "<meta name='description' content='Single-quoted description.'>"
      expect(extractPageMetadata(html, 'https://example.com/page', null).metaDescription).toBe('Single-quoted description.')
    })

    it('extracts a meta description written as a self-closing tag with a trailing slash', () => {
      const html = '<meta name="description" content="Self-closing description." />'
      expect(extractPageMetadata(html, 'https://example.com/page', null).metaDescription).toBe('Self-closing description.')
    })

    it('extracts a meta description whose attributes span multiple lines', () => {
      const html = `<meta\n  name="description"\n  content="Multi-line attribute description.">`
      expect(extractPageMetadata(html, 'https://example.com/page', null).metaDescription).toBe('Multi-line attribute description.')
    })

    it('extracts an H1 carrying typical Elementor-style classes and data attributes', () => {
      const html = '<h1 class="elementor-heading-title elementor-size-default" data-id="abc123">Our Services</h1>'
      const result = extractPageMetadata(html, 'https://example.com/page', null)
      expect(result.h1Text).toBe('Our Services')
      expect(result.h1Count).toBe(1)
    })

    it('does not mistake an H2/H3 (or any non-h1 heading) for an H1', () => {
      const html = '<h2 class="elementor-heading-title">Not An H1</h2><h3>Also Not An H1</h3>'
      const result = extractPageMetadata(html, 'https://example.com/page', null)
      expect(result.h1Text).toBeNull()
      expect(result.h1Count).toBe(0)
    })

    it('a genuinely H1-less page (theme puts only the site name in header H1, page content starts at H2) correctly extracts h1Count 0 — this is a real, non-buggy possible site characteristic', () => {
      const html = '<body><header><div class="site-logo">Bespoke</div></header><main><h2>Digital Marketing</h2><p>Content...</p></main></body>'
      const result = extractPageMetadata(html, 'https://example.com/page', null)
      expect(result.h1Text).toBeNull()
      expect(result.h1Count).toBe(0)
    })
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
