import { describe, expect, it } from 'vitest'
import { classifyPageType } from '@/lib/content/page-purpose'
import { makePage } from './helpers/architecture-fixtures'

/**
 * Phase 29 — PAGE PURPOSE coverage: high-confidence cases (homepage,
 * contact with agreeing signals), ambiguous cases fall back to unknown, and
 * explicit proof no fragile URL-only decision exists (URL signal alone is
 * never sufficient).
 */
describe('classifyPageType', () => {
  it('classifies the seed/depth-0 page as homepage with high confidence — a structural fact, not a guess', () => {
    const page = makePage({ url: 'https://example.com/', depth: 0 })
    expect(classifyPageType(page, true)).toEqual({ type: 'homepage', confidence: 'high' })
  })

  it('classifies a page as contact when the URL AND title both agree', () => {
    const page = makePage({ url: 'https://example.com/contact', title: 'Contact Us | Example Co' })
    expect(classifyPageType(page, false)).toEqual({ type: 'contact', confidence: 'medium' })
  })

  it('classifies a page as contact when the URL AND H1 both agree (title need not also match)', () => {
    const page = makePage({ url: 'https://example.com/contact-us', title: 'Example Co', h1_text: 'Get in Contact' })
    expect(classifyPageType(page, false)).toEqual({ type: 'contact', confidence: 'medium' })
  })

  it('does NOT classify as contact from the URL signal ALONE — never fragile URL-only decision', () => {
    const page = makePage({ url: 'https://example.com/contact', title: 'Our Services', h1_text: 'What We Offer' })
    expect(classifyPageType(page, false)).toEqual({ type: 'unknown', confidence: 'low' })
  })

  it('does NOT classify as contact from title/H1 alone without the URL also agreeing', () => {
    const page = makePage({ url: 'https://example.com/get-in-touch', title: 'Contact Our Team', h1_text: 'Contact' })
    expect(classifyPageType(page, false)).toEqual({ type: 'unknown', confidence: 'low' })
  })

  it('classifies a page under a "/services/" URL path segment as service — URL alone is sufficient (a routing convention, not incidental prose)', () => {
    const page = makePage({ url: 'https://example.com/services/digital-marketing', title: 'Digital Marketing Services', h1_text: 'Digital Marketing' })
    expect(classifyPageType(page, false)).toEqual({ type: 'service', confidence: 'medium' })
  })

  it('classifies a bare "/services" listing root (nothing after it) as category, not service', () => {
    const page = makePage({ url: 'https://example.com/services', title: 'Our Services' })
    expect(classifyPageType(page, false)).toEqual({ type: 'category', confidence: 'medium' })
  })

  it('does NOT classify "/services-agreement" as service — exact path-segment match only, never a substring', () => {
    const page = makePage({ url: 'https://example.com/services-agreement' })
    expect(classifyPageType(page, false)).toEqual({ type: 'unknown', confidence: 'low' })
  })

  it('classifies a "/shop/widget" page as product', () => {
    const page = makePage({ url: 'https://example.com/shop/widget' })
    expect(classifyPageType(page, false)).toEqual({ type: 'product', confidence: 'medium' })
  })

  it('classifies a bare "/shop" listing root as category, not product', () => {
    const page = makePage({ url: 'https://example.com/shop' })
    expect(classifyPageType(page, false)).toEqual({ type: 'category', confidence: 'medium' })
  })

  it('classifies a "/blog/my-post-title" page as article', () => {
    const page = makePage({ url: 'https://example.com/blog/my-post-title' })
    expect(classifyPageType(page, false)).toEqual({ type: 'article', confidence: 'medium' })
  })

  it('classifies a bare "/blog" listing root as category, not article', () => {
    const page = makePage({ url: 'https://example.com/blog' })
    expect(classifyPageType(page, false)).toEqual({ type: 'category', confidence: 'medium' })
  })

  it('classifies any depth under "/category/" or "/collections/" as category, regardless of further nesting', () => {
    expect(classifyPageType(makePage({ url: 'https://example.com/category/electronics' }), false)).toEqual({ type: 'category', confidence: 'medium' })
    expect(classifyPageType(makePage({ url: 'https://example.com/collections/summer/sale' }), false)).toEqual({ type: 'category', confidence: 'medium' })
  })

  it('classifies "/about-us" as about when the URL AND title/H1 both agree', () => {
    const page = makePage({ url: 'https://example.com/about-us', title: 'About Our Company' })
    expect(classifyPageType(page, false)).toEqual({ type: 'about', confidence: 'medium' })
  })

  it('does NOT classify as about from the URL segment alone without title/H1 corroboration', () => {
    const page = makePage({ url: 'https://example.com/about-us', title: 'Careers', h1_text: 'Join Our Team' })
    expect(classifyPageType(page, false)).toEqual({ type: 'unknown', confidence: 'low' })
  })

  it('an ordinary, genuinely ambiguous page (no matching URL segment, no title/H1 signal) classifies as unknown, never a fragile guess', () => {
    const page = makePage({ url: 'https://example.com/why-choose-us', title: 'Why Choose Us', h1_text: 'Why Choose Us' })
    expect(classifyPageType(page, false)).toEqual({ type: 'unknown', confidence: 'low' })
  })

  it('never classifies "landing" or "other" in this pass — no reliable generic signal exists for them yet, and unknown is the honest fallback', () => {
    const pages = [
      makePage({ url: 'https://example.com/spring-sale-2026' }),
      makePage({ url: 'https://example.com/webinar-signup' }),
    ]
    for (const page of pages) {
      expect(classifyPageType(page, false).type).not.toBe('landing')
      expect(classifyPageType(page, false).type).not.toBe('other')
    }
  })
})
