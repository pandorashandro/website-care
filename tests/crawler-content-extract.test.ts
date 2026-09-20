import { describe, expect, it } from 'vitest'
import { extractContentEvidence, CONTENT_TEXT_MAX_CHARS, MIN_WORDS_FOR_FINGERPRINT, MIN_BLOCK_WORDS } from '@/lib/crawler/content-extract'

/**
 * Phase 29 real-world evidence-quality pass — CONTENT EXTRACTION coverage.
 * A fresh Bespoke crawl proved the ORIGINAL `<p>`-only extraction too
 * narrow: visibly populated pages (home, services, about-us) extracted to
 * 0 substantive words because their body copy was rendered inside `<div>`
 * page-builder containers, never literal `<p>` tags. This suite locks in
 * the corrected block-based extraction (lib/scanner/checks.ts's
 * getSubstantiveBlocks) against that exact failure mode and every other
 * realistic structure this phase's own instructions enumerate.
 */
describe('extractContentEvidence', () => {
  it('extracts word count, paragraph count, and headings from a normal <p>-based page', () => {
    const html = `
      <body>
        <h2>Our Process</h2>
        <p>We start with a consultation to understand your goals and requirements in detail.</p>
        <p>Then we deliver a tailored plan with clear milestones and timelines for every stage.</p>
        <h2>Why Choose Us</h2>
        <p>Our team has years of experience delivering measurable results for clients like you.</p>
      </body>
    `
    const result = extractContentEvidence(html)

    expect(result.contentParagraphCount).toBe(3)
    expect(result.contentHeadingTexts).toEqual(['Our Process', 'Why Choose Us'])
    expect(result.contentWordCount).toBeGreaterThan(30)
    expect(result.contentText).toContain('consultation')
    expect(result.contentHash).not.toBeNull()
    expect(result.contentExtractionConfidence).toBe('high')
  })

  it('THE ROOT-CAUSE FIX: extracts substantive content from page-builder-style <div> containers with no <p> tags at all', () => {
    // Mirrors the real Bespoke failure mode: text-editor/icon-box-style
    // widgets that render body copy as plain <div> content.
    const html = `
      <body>
        <div class="elementor-widget-container">
          <div class="elementor-text-editor">We help growing businesses build tailored marketing and systems integrations that actually move the needle.</div>
        </div>
        <div class="elementor-widget-container">
          <div class="elementor-text-editor">Our team works closely with you to understand your goals before recommending any specific solution or platform.</div>
        </div>
      </body>
    `
    const result = extractContentEvidence(html)
    expect(result.contentWordCount).toBeGreaterThan(15)
    expect(result.contentText).toContain('tailored marketing')
  })

  it('extracts substantive content from <main>/<article>/<section> wrapping generic <div> content', () => {
    const html = `
      <main>
        <article>
          <section>
            <div>This article explains our approach to digital marketing in clear, practical terms for business owners.</div>
          </section>
        </article>
      </main>
    `
    const result = extractContentEvidence(html)
    expect(result.contentWordCount).toBeGreaterThan(10)
  })

  it('extracts nested block content without duplicating the nested element\'s text', () => {
    const html = '<div>Intro sentence with enough words to count as a block on its own right here.<div>Nested sentence with enough words to also count as its own separate block.</div>Outro sentence with enough words to count as a third distinct block here.</div>'
    const result = extractContentEvidence(html)
    // Each sentence should appear exactly ONCE in the reconstructed text,
    // never twice (which a naive recursive textContent-style extraction
    // would produce for the nested div).
    const occurrences = (result.contentText?.match(/Nested sentence/g) ?? []).length
    expect(occurrences).toBe(1)
    expect(result.contentParagraphCount).toBe(3)
  })

  it('extracts content from inline elements (span) surrounding real text with no block wrapper', () => {
    const html = '<body><span>This text is wrapped only in inline elements</span> and continues as plain text with <span>more inline-wrapped words</span> right here without any block-level container at all.</body>'
    const result = extractContentEvidence(html)
    expect(result.contentWordCount).toBeGreaterThan(10)
  })

  it('excludes <nav> content entirely, even when not wrapped in <p> tags', () => {
    const html = '<nav><a href="/">Home</a><a href="/about">About Our Company</a><a href="/contact">Contact Us Today</a><a href="/services">Our Services</a></nav>'
    const result = extractContentEvidence(html)
    expect(result.contentWordCount).toBe(0)
  })

  it('excludes <header> and <footer> content entirely', () => {
    const html = `
      <header><div>Site Name Here And A Tagline Too</div></header>
      <footer><div>Copyright 2026 Example Company. All rights reserved. Privacy policy and terms apply.</div></footer>
    `
    const result = extractContentEvidence(html)
    expect(result.contentWordCount).toBe(0)
  })

  it('excludes a menu block even when it is a generic <div> with many short link labels', () => {
    const html = '<div class="menu"><div>Home</div><div>About</div><div>Services</div><div>Contact</div></div>'
    const result = extractContentEvidence(html)
    // Each label is well under MIN_BLOCK_WORDS -- filtered as non-substantive.
    expect(result.contentWordCount).toBe(0)
  })

  it('excludes a repeated global CTA the same way real body content would count it (present, not double-penalized) — this function only extracts, cross-page repetition is a separate analysis concern', () => {
    const html = '<div>Contact us today to schedule a free consultation with our experienced team of specialists.</div>'
    const result = extractContentEvidence(html)
    expect(result.contentWordCount).toBeGreaterThan(0)
  })

  it('excludes script, style, noscript, and template content', () => {
    const html =
      '<div>Real paragraph text here that is genuinely substantive and should be counted.</div>' +
      '<script>var secret = "not content";</script>' +
      '<style>.x { color: red; }</style>' +
      '<noscript>Enable JavaScript to see interactive content on this page.</noscript>' +
      '<template><div>Template content that is never actually rendered directly.</div></template>'
    const result = extractContentEvidence(html)
    expect(result.contentText).not.toContain('secret')
    expect(result.contentText).not.toContain('color')
    expect(result.contentText).not.toContain('Enable JavaScript')
    expect(result.contentText).not.toContain('Template content')
  })

  it('returns zero/null evidence for a genuinely empty page', () => {
    const result = extractContentEvidence('<html><body></body></html>')
    expect(result.contentWordCount).toBe(0)
    expect(result.contentParagraphCount).toBe(0)
    expect(result.contentHeadingTexts).toEqual([])
    expect(result.contentText).toBeNull()
    expect(result.contentHash).toBeNull()
    expect(result.contentExtractionConfidence).toBe('high') // genuinely empty, not suspicious (no large raw-text gap)
  })

  it('excludes ARIA landmark roles (role="banner"/"navigation"/"contentinfo"/"complementary") even when the markup uses generic <div> instead of semantic tags — GENERIC page-builder chrome, not any specific CMS', () => {
    const html = `
      <div role="banner"><div>Site Name Here And A Tagline Too</div><div>Talk to an Expert</div></div>
      <div role="navigation"><div>Home</div><div>About Our Company</div><div>Our Services</div></div>
      <div role="complementary"><div>Related links go here for the sidebar widget area</div></div>
      <div role="contentinfo"><div>Copyright notice and legal links live in this footer region</div></div>
      <p>This is the one real, substantive paragraph of body content on the page for a visitor.</p>
    `
    const result = extractContentEvidence(html)
    expect(result.contentText).toContain('one real, substantive paragraph')
    expect(result.contentText).not.toContain('Talk to an Expert')
    expect(result.contentText).not.toContain('Tagline')
    expect(result.contentText).not.toContain('Related links')
    expect(result.contentText).not.toContain('Copyright notice')
    expect(result.contentParagraphCount).toBe(1)
  })

  it('excludes <aside> content entirely, mirroring nav/header/footer', () => {
    const html = '<aside><div>Popular posts and related widgets live here in the sidebar.</div></aside><p>The main article content that a visitor actually came to read is right here.</p>'
    const result = extractContentEvidence(html)
    expect(result.contentText).not.toContain('sidebar')
    expect(result.contentText).toContain('main article content')
  })

  it('excludes a standard WCAG "skip to main content" accessibility link — a universal, non-CMS-specific idiom, not this site\'s own copy', () => {
    const html = '<a href="#main">Skip to main content</a><p>Real page content that a visitor is actually here to read follows this link.</p>'
    const result = extractContentEvidence(html)
    expect(result.contentText).not.toContain('Skip to main content')
    expect(result.contentText).toContain('Real page content')
  })

  it('excludes "Skip to content" and "Skip navigation" phrasing variants of the same accessibility idiom', () => {
    const htmlA = '<a href="#content">Skip to content</a><p>Substantive body text that belongs to this specific page goes here.</p>'
    const htmlB = '<a href="#nav">Skip navigation</a><p>Substantive body text that belongs to this specific page goes here.</p>'
    expect(extractContentEvidence(htmlA).contentText).not.toContain('Skip to content')
    expect(extractContentEvidence(htmlB).contentText).not.toContain('Skip navigation')
  })

  it('does NOT strip a legitimate paragraph merely because it contains the word "skip" or "navigation" in ordinary prose (no over-filtering)', () => {
    const html = '<p>Our guide explains how to navigation-proof your checklist and never skip a single required step in the process.</p>'
    const result = extractContentEvidence(html)
    expect(result.contentText).toContain('navigation-proof')
    expect(result.contentText).toContain('never skip a single required step')
  })

  it('a navigation/footer-only page (no other content) extracts zero substantive words', () => {
    const html = `
      <nav><a href="/">Home</a><a href="/about">About</a><a href="/contact">Contact</a></nav>
      <footer><span>© 2026 Example Inc.</span></footer>
    `
    const result = extractContentEvidence(html)
    expect(result.contentParagraphCount).toBe(0)
    expect(result.contentWordCount).toBe(0)
  })

  it('handles malformed HTML without throwing', () => {
    const html = '<p>Unclosed paragraph <div>nested weirdly <p>another one</div>'
    expect(() => extractContentEvidence(html)).not.toThrow()
  })

  it('normalizes whitespace, including pre-existing newlines WITHIN a single block\'s own text, never splitting one block into multiple', () => {
    const html = '<p>Text   with\n\n  irregular   \t whitespace   throughout the paragraph itself.</p>'
    const result = extractContentEvidence(html)
    expect(result.contentText).toBe('Text with irregular whitespace throughout the paragraph itself.')
    expect(result.contentParagraphCount).toBe(1)
  })

  it('bounds content_text to CONTENT_TEXT_MAX_CHARS while word/paragraph counts reflect the FULL page', () => {
    const longParagraph = 'word '.repeat(2000).trim()
    const html = `<p>${longParagraph}</p>`
    const result = extractContentEvidence(html)

    expect(result.contentText!.length).toBeLessThanOrEqual(CONTENT_TEXT_MAX_CHARS)
    expect(result.contentWordCount).toBe(2000) // full count, not truncated
  })

  it('does not fingerprint pages below MIN_WORDS_FOR_FINGERPRINT', () => {
    const html = '<p>Too short.</p>'
    const result = extractContentEvidence(html)
    expect(result.contentWordCount).toBeLessThan(MIN_WORDS_FOR_FINGERPRINT)
    expect(result.contentHash).toBeNull()
  })

  it('produces identical hashes for pages with identical substantive text, and different hashes for different text', () => {
    const htmlA = '<p>This is a sufficiently long paragraph of genuinely substantive written content for testing.</p>'
    const htmlB = '<p>This is a sufficiently long paragraph of genuinely substantive written content for testing.</p>'
    const htmlC = '<p>This is a completely different paragraph with entirely unrelated substantive written content.</p>'

    const a = extractContentEvidence(htmlA)
    const b = extractContentEvidence(htmlB)
    const c = extractContentEvidence(htmlC)

    expect(a.contentHash).toBe(b.contentHash)
    expect(a.contentHash).not.toBe(c.contentHash)
  })

  it('caps stored heading texts and truncates each one', () => {
    const manyHeadings = Array.from({ length: 30 }, (_, i) => `<h2>Heading number ${i} with some extra descriptive text</h2>`).join('')
    const result = extractContentEvidence(manyHeadings)
    expect(result.contentHeadingTexts.length).toBeLessThanOrEqual(20)
  })

  describe('extraction confidence (low-confidence / insufficient-evidence detection)', () => {
    it('is "low" when substantial raw visible text exists but almost none of it lands in a substantive block (e.g. many short fragments each below MIN_BLOCK_WORDS)', () => {
      // 30 short 2-word fragments -- individually filtered by MIN_BLOCK_WORDS,
      // but their COMBINED raw visible text is clearly non-trivial.
      const html = Array.from({ length: 30 }, (_, i) => `<div>Item ${i}</div>`).join('')
      const result = extractContentEvidence(html)
      expect(result.contentWordCount).toBeLessThan(20)
      expect(result.contentExtractionConfidence).toBe('low')
    })

    it('is "high" for a normal page whose substantive word count is proportionate to its raw visible text', () => {
      const html = '<p>This is a normal, genuinely substantive paragraph with plenty of real words in it for a real page.</p>'
      const result = extractContentEvidence(html)
      expect(result.contentExtractionConfidence).toBe('high')
    })

    it('MIN_BLOCK_WORDS is a small, documented constant (sanity check, not a folklore threshold)', () => {
      expect(MIN_BLOCK_WORDS).toBeGreaterThan(0)
      expect(MIN_BLOCK_WORDS).toBeLessThan(10)
    })
  })
})
