import { describe, expect, it } from 'vitest'
import { extractPerformanceEvidence, extractAccessibilityEvidence, extractSecurityEvidence, emptySecurityEvidence } from '@/lib/crawler/pillar-extract'

const NO_HEADERS = { contentEncoding: null, cacheControl: null }
const NO_SECURITY_HEADERS = {
  strictTransportSecurity: null,
  contentSecurityPolicy: null,
  xContentTypeOptions: null,
  referrerPolicy: null,
  xFrameOptions: null,
  permissionsPolicy: null,
}

describe('extractPerformanceEvidence', () => {
  it('counts external scripts and stylesheets', () => {
    const html = '<script src="/a.js"></script><script src="/b.js"></script><link rel="stylesheet" href="/a.css">'
    const evidence = extractPerformanceEvidence(html, NO_HEADERS)
    expect(evidence.scriptCount).toBe(2)
    expect(evidence.stylesheetCount).toBe(1)
  })

  it('does not count inline scripts (no src) toward scriptCount', () => {
    const html = '<script>console.log(1)</script>'
    expect(extractPerformanceEvidence(html, NO_HEADERS).scriptCount).toBe(0)
  })

  it('flags a head script with neither async nor defer as render-blocking', () => {
    const html = '<head><script src="/a.js"></script></head>'
    expect(extractPerformanceEvidence(html, NO_HEADERS).renderBlockingScriptCount).toBe(1)
  })

  it('does not flag a head script with async or defer as render-blocking', () => {
    const html = '<head><script src="/a.js" defer></script><script src="/b.js" async></script></head>'
    expect(extractPerformanceEvidence(html, NO_HEADERS).renderBlockingScriptCount).toBe(0)
  })

  it('does not count a body script toward render-blocking (only <head> scripts count)', () => {
    const html = '<head></head><body><script src="/a.js"></script></body>'
    expect(extractPerformanceEvidence(html, NO_HEADERS).renderBlockingScriptCount).toBe(0)
  })

  it('flags images missing width/height', () => {
    const html = '<img src="a.jpg" width="100" height="100"><img src="b.jpg">'
    expect(extractPerformanceEvidence(html, NO_HEADERS).imagesMissingDimensionsCount).toBe(1)
  })

  it('exempts the first few images from the lazy-loading opportunity (likely above-the-fold)', () => {
    const html = Array.from({ length: 5 }, (_, i) => `<img src="${i}.jpg">`).join('')
    // 5 images total, first 3 exempt -> only 2 counted as missing lazy-loading
    expect(extractPerformanceEvidence(html, NO_HEADERS).imagesMissingLazyLoadingCount).toBe(2)
  })

  it('does not flag an image beyond the exempt count that already has loading="lazy"', () => {
    const html = Array.from({ length: 5 }, (_, i) => `<img src="${i}.jpg" loading="lazy">`).join('')
    expect(extractPerformanceEvidence(html, NO_HEADERS).imagesMissingLazyLoadingCount).toBe(0)
  })

  it('carries through the raw content-encoding/cache-control header values verbatim', () => {
    const evidence = extractPerformanceEvidence('<p>x</p>', { contentEncoding: 'gzip', cacheControl: 'max-age=3600' })
    expect(evidence.responseContentEncoding).toBe('gzip')
    expect(evidence.responseCacheControl).toBe('max-age=3600')
  })
})

describe('extractAccessibilityEvidence', () => {
  it('counts images missing an alt attribute entirely', () => {
    const html = '<img src="a.jpg" alt="A cat"><img src="b.jpg" alt=""><img src="c.jpg">'
    // alt="" is a VALID decorative-image pattern, never counted as missing.
    expect(extractAccessibilityEvidence(html).imagesMissingAltCount).toBe(1)
    expect(extractAccessibilityEvidence(html).imageCount).toBe(3)
  })

  it('reads the html lang attribute, or null if missing/empty', () => {
    expect(extractAccessibilityEvidence('<html lang="en"><body></body></html>').htmlLang).toBe('en')
    expect(extractAccessibilityEvidence('<html><body></body></html>').htmlLang).toBeNull()
    expect(extractAccessibilityEvidence('<html lang=""><body></body></html>').htmlLang).toBeNull()
  })

  it('flags a form input with no label, aria-label, aria-labelledby, or title', () => {
    const html = '<form><input type="text" id="name"><label for="name">Name</label><input type="text" id="email"></form>'
    expect(extractAccessibilityEvidence(html).formInputsMissingLabelCount).toBe(1)
  })

  it('does not flag hidden/submit/button/reset/image inputs', () => {
    const html = '<input type="hidden" value="1"><input type="submit" value="Go"><input type="button" value="Click">'
    expect(extractAccessibilityEvidence(html).formInputsMissingLabelCount).toBe(0)
  })

  it('an input with aria-label is not flagged even with no <label>', () => {
    const html = '<input type="text" aria-label="Search">'
    expect(extractAccessibilityEvidence(html).formInputsMissingLabelCount).toBe(0)
  })

  it('flags a link with no visible text and no accessible-name attribute', () => {
    const html = '<a href="/x"><svg></svg></a><a href="/y">Learn more</a>'
    expect(extractAccessibilityEvidence(html).linksMissingAccessibleNameCount).toBe(1)
  })

  it('does not flag an icon-only link that has an aria-label', () => {
    const html = '<a href="/x" aria-label="Close menu"><svg></svg></a>'
    expect(extractAccessibilityEvidence(html).linksMissingAccessibleNameCount).toBe(0)
  })

  it('counts duplicate ids across the page', () => {
    const html = '<div id="main"></div><div id="main"></div><div id="other"></div>'
    expect(extractAccessibilityEvidence(html).duplicateIdCount).toBe(1)
  })

  it('flags an iframe with no title attribute', () => {
    const html = '<iframe src="https://example.com/embed"></iframe><iframe src="https://example.com/x" title="Video player"></iframe>'
    expect(extractAccessibilityEvidence(html).iframeMissingTitleCount).toBe(1)
  })
})

describe('extractSecurityEvidence', () => {
  it('reports isHttps true for an https final URL', () => {
    expect(extractSecurityEvidence('<p></p>', 'https://example.com/', NO_SECURITY_HEADERS).isHttps).toBe(true)
  })

  it('reports isHttps false for an http final URL', () => {
    expect(extractSecurityEvidence('<p></p>', 'http://example.com/', NO_SECURITY_HEADERS).isHttps).toBe(false)
  })

  it('flags mixed content (http:// resource references) ONLY on an https page', () => {
    const html = '<img src="http://example.com/a.jpg"><script src="http://example.com/b.js"></script>'
    expect(extractSecurityEvidence(html, 'https://example.com/', NO_SECURITY_HEADERS).mixedContentCount).toBe(2)
    // The exact same markup on an http page is not "mixed" content — the whole page is already insecure.
    expect(extractSecurityEvidence(html, 'http://example.com/', NO_SECURITY_HEADERS).mixedContentCount).toBe(0)
  })

  it('flags a form that submits over plain http', () => {
    const html = '<form action="http://example.com/submit"></form>'
    expect(extractSecurityEvidence(html, 'https://example.com/', NO_SECURITY_HEADERS).insecureFormCount).toBe(1)
  })

  it('carries through raw security header values verbatim', () => {
    const headers = { ...NO_SECURITY_HEADERS, strictTransportSecurity: 'max-age=31536000', contentSecurityPolicy: "default-src 'self'" }
    const evidence = extractSecurityEvidence('<p></p>', 'https://example.com/', headers)
    expect(evidence.headers.strictTransportSecurity).toBe('max-age=31536000')
    expect(evidence.headers.contentSecurityPolicy).toBe("default-src 'self'")
  })

  it('emptySecurityEvidence still reports a real isHttps fact from the URL alone', () => {
    expect(emptySecurityEvidence('https://example.com/file.pdf').isHttps).toBe(true)
    expect(emptySecurityEvidence('http://example.com/file.pdf').isHttps).toBe(false)
  })
})
