import { describe, expect, it } from 'vitest'
import { normalizeCrawlUrl, isCrawlableSameSiteUrl } from '@/lib/crawler/url-policy'

describe('normalizeCrawlUrl', () => {
  it('resolves relative URLs against the base', () => {
    expect(normalizeCrawlUrl('/about', 'https://example.com/')).toBe('https://example.com/about')
  })

  it('strips fragments', () => {
    expect(normalizeCrawlUrl('https://example.com/page#section', 'https://example.com/')).toBe('https://example.com/page')
  })

  it('normalizes trailing slashes', () => {
    expect(normalizeCrawlUrl('https://example.com/page/', 'https://example.com/')).toBe('https://example.com/page')
  })

  it('drops default ports', () => {
    expect(normalizeCrawlUrl('https://example.com:443/page', 'https://example.com/')).toBe('https://example.com/page')
    expect(normalizeCrawlUrl('http://example.com:80/page', 'http://example.com/')).toBe('http://example.com/page')
  })

  it('lowercases the hostname', () => {
    expect(normalizeCrawlUrl('https://EXAMPLE.com/Page', 'https://example.com/')).toBe('https://example.com/Page')
  })

  it('rejects non-http(s) schemes', () => {
    expect(normalizeCrawlUrl('mailto:hi@example.com', 'https://example.com/')).toBeNull()
    expect(normalizeCrawlUrl('javascript:void(0)', 'https://example.com/')).toBeNull()
  })

  it('strips known tracking query parameters', () => {
    expect(normalizeCrawlUrl('https://example.com/p?utm_source=x&utm_medium=y&fbclid=z', 'https://example.com/')).toBe('https://example.com/p')
  })

  it('keeps non-tracking query parameters', () => {
    expect(normalizeCrawlUrl('https://example.com/p?id=42', 'https://example.com/')).toBe('https://example.com/p?id=42')
  })

  it('keeps real parameters while stripping tracking ones mixed together', () => {
    expect(normalizeCrawlUrl('https://example.com/p?id=42&utm_source=newsletter', 'https://example.com/')).toBe('https://example.com/p?id=42')
  })

  it('normalizes query parameter order so equivalent URLs dedupe identically', () => {
    const a = normalizeCrawlUrl('https://example.com/p?b=2&a=1', 'https://example.com/')
    const b = normalizeCrawlUrl('https://example.com/p?a=1&b=2', 'https://example.com/')
    expect(a).toBe(b)
  })

  it('returns null for unparseable input', () => {
    expect(normalizeCrawlUrl('http://', 'https://example.com/')).toBeNull()
  })
})

describe('isCrawlableSameSiteUrl', () => {
  it('accepts a same-host HTML-shaped URL', () => {
    expect(isCrawlableSameSiteUrl('https://example.com/about', 'example.com')).toBe(true)
  })

  it('rejects a different host', () => {
    expect(isCrawlableSameSiteUrl('https://evil.example.net/about', 'example.com')).toBe(false)
  })

  it('rejects known non-page asset extensions', () => {
    expect(isCrawlableSameSiteUrl('https://example.com/logo.png', 'example.com')).toBe(false)
    expect(isCrawlableSameSiteUrl('https://example.com/app.js', 'example.com')).toBe(false)
  })
})
