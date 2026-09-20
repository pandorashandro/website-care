import { describe, expect, it } from 'vitest'
import { computeFindingFingerprint } from '@/lib/monitoring/fingerprint'

describe('computeFindingFingerprint', () => {
  it('SITE-SCOPED: identity is pillar+checkKey only, independent of any instance', () => {
    const fingerprint = computeFindingFingerprint({ pillar: 'technical_seo', checkKey: 'robots_blocks_site', scope: 'site' })
    expect(fingerprint).toBe('technical_seo:robots_blocks_site')
  })

  it('SITE-SCOPED: two different websites analyzed independently would still produce the same fingerprint for the same check — this is expected, since comparison always happens within one website\'s own two snapshots, never across websites', () => {
    const a = computeFindingFingerprint({ pillar: 'security', checkKey: 'not_using_https', scope: 'site' })
    const b = computeFindingFingerprint({ pillar: 'security', checkKey: 'not_using_https', scope: 'site' })
    expect(a).toBe(b)
  })

  it('PAGE-SCOPED: identity includes the normalized page URL', () => {
    const fingerprint = computeFindingFingerprint({
      pillar: 'on_page_seo',
      checkKey: 'missing_title',
      scope: 'page',
      instance: { url: 'https://example.com/services', affectedResourceUrl: null },
    })
    expect(fingerprint).toBe('on_page_seo:missing_title:https://example.com/services')
  })

  it('PAGE-SCOPED: a trailing slash and other incidental URL differences normalize to the SAME fingerprint', () => {
    const a = computeFindingFingerprint({
      pillar: 'on_page_seo',
      checkKey: 'missing_title',
      scope: 'page',
      instance: { url: 'https://example.com/services/', affectedResourceUrl: null },
    })
    const b = computeFindingFingerprint({
      pillar: 'on_page_seo',
      checkKey: 'missing_title',
      scope: 'page',
      instance: { url: 'https://example.com/services', affectedResourceUrl: null },
    })
    expect(a).toBe(b)
  })

  it('PAGE-SCOPED: a different page produces a different fingerprint', () => {
    const a = computeFindingFingerprint({
      pillar: 'on_page_seo',
      checkKey: 'missing_title',
      scope: 'page',
      instance: { url: 'https://example.com/services', affectedResourceUrl: null },
    })
    const b = computeFindingFingerprint({
      pillar: 'on_page_seo',
      checkKey: 'missing_title',
      scope: 'page',
      instance: { url: 'https://example.com/about', affectedResourceUrl: null },
    })
    expect(a).not.toBe(b)
  })

  it('RESOURCE-SCOPED: identity includes both the page and the specific affected resource (e.g. one image among several on the same page)', () => {
    const photo = computeFindingFingerprint({
      pillar: 'accessibility',
      checkKey: 'images_missing_alt',
      scope: 'page',
      instance: { url: 'https://example.com/gallery', affectedResourceUrl: 'https://example.com/photo1.jpg' },
    })
    const logo = computeFindingFingerprint({
      pillar: 'accessibility',
      checkKey: 'images_missing_alt',
      scope: 'page',
      instance: { url: 'https://example.com/gallery', affectedResourceUrl: 'https://example.com/logo.png' },
    })
    expect(photo).not.toBe(logo)
  })

  it('RESOURCE-SCOPED: the SAME image on the same page produces the SAME fingerprint regardless of casing differences', () => {
    const a = computeFindingFingerprint({
      pillar: 'accessibility',
      checkKey: 'images_missing_alt',
      scope: 'page',
      instance: { url: 'https://example.com/gallery', affectedResourceUrl: 'https://example.com/Photo1.JPG' },
    })
    const b = computeFindingFingerprint({
      pillar: 'accessibility',
      checkKey: 'images_missing_alt',
      scope: 'page',
      instance: { url: 'https://example.com/gallery', affectedResourceUrl: 'https://example.com/photo1.jpg' },
    })
    expect(a).toBe(b)
  })

  it('EDGE-SCOPED: a broken internal link is identified by its (source page, target URL) pair, using the same (url, affectedResourceUrl) fields as resource-scoped findings', () => {
    const fingerprint = computeFindingFingerprint({
      pillar: 'site_architecture',
      checkKey: 'internal_link_to_broken_edge',
      scope: 'page',
      instance: { url: 'https://example.com/about', affectedResourceUrl: 'https://example.com/old-page' },
    })
    expect(fingerprint).toBe('site_architecture:internal_link_to_broken_edge:https://example.com/about:https://example.com/old-page')
  })

  it('EDGE-SCOPED: the same target linked from a DIFFERENT source page is a different identity', () => {
    const fromAbout = computeFindingFingerprint({
      pillar: 'site_architecture',
      checkKey: 'internal_link_to_broken_edge',
      scope: 'page',
      instance: { url: 'https://example.com/about', affectedResourceUrl: 'https://example.com/old-page' },
    })
    const fromContact = computeFindingFingerprint({
      pillar: 'site_architecture',
      checkKey: 'internal_link_to_broken_edge',
      scope: 'page',
      instance: { url: 'https://example.com/contact', affectedResourceUrl: 'https://example.com/old-page' },
    })
    expect(fromAbout).not.toBe(fromContact)
  })

  it('a non-URL discriminator (e.g. a content hash used by exact-duplicate-content) is preserved as an opaque string, never mistaken for a URL and corrupted by normalization', () => {
    const fingerprint = computeFindingFingerprint({
      pillar: 'content',
      checkKey: 'exact_duplicate_content',
      scope: 'page',
      instance: { url: 'https://example.com/page-a', affectedResourceUrl: 'sha256:ABC123' },
    })
    expect(fingerprint).toBe('content:exact_duplicate_content:https://example.com/page-a:sha256:abc123')
  })

  it('a different checkKey on the identical page/resource never collides', () => {
    const a = computeFindingFingerprint({
      pillar: 'on_page_seo',
      checkKey: 'missing_title',
      scope: 'page',
      instance: { url: 'https://example.com/services', affectedResourceUrl: null },
    })
    const b = computeFindingFingerprint({
      pillar: 'on_page_seo',
      checkKey: 'title_too_short',
      scope: 'page',
      instance: { url: 'https://example.com/services', affectedResourceUrl: null },
    })
    expect(a).not.toBe(b)
  })

  it('a different pillar with the identical checkKey/page never collides (pillar is part of the identity)', () => {
    const a = computeFindingFingerprint({
      pillar: 'on_page_seo',
      checkKey: 'missing_title',
      scope: 'page',
      instance: { url: 'https://example.com/services', affectedResourceUrl: null },
    })
    const b = computeFindingFingerprint({
      pillar: 'content',
      checkKey: 'missing_title',
      scope: 'page',
      instance: { url: 'https://example.com/services', affectedResourceUrl: null },
    })
    expect(a).not.toBe(b)
  })

  it('throws rather than silently mis-identifying a page-scoped finding with no instance supplied', () => {
    expect(() => computeFindingFingerprint({ pillar: 'on_page_seo', checkKey: 'missing_title', scope: 'page' })).toThrow()
  })
})
