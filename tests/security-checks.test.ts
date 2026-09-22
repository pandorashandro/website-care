import { describe, expect, it } from 'vitest'
import { analyzeNotUsingHttps } from '@/lib/security/checks/not-using-https'
import { analyzeMixedContent } from '@/lib/security/checks/mixed-content'
import { analyzeInsecureForms } from '@/lib/security/checks/insecure-forms'
import { analyzeSecurityHeadersOpportunity } from '@/lib/security/checks/security-headers-opportunity'
import { analyzeHygieneScopeNotice } from '@/lib/security/checks/hygiene-scope-notice'
import { pillarContextFor } from './helpers/pillar-fixtures'
import { makePage } from './helpers/architecture-fixtures'

describe('Security checks', () => {
  it('flags a page not served over HTTPS, at high severity', () => {
    const page = makePage({ url: 'https://example.com/a', security_evidence: { isHttps: false } })
    const finding = analyzeNotUsingHttps(pillarContextFor([page]))[0]
    expect(finding.baseSeverity).toBe('high')
    expect(finding.kind).toBe('problem')
  })

  it('does not flag an https page', () => {
    const page = makePage({ url: 'https://example.com/a', security_evidence: { isHttps: true } })
    expect(analyzeNotUsingHttps(pillarContextFor([page]))).toEqual([])
  })

  /**
   * Evidence-aware health scoring (2026-09-22) — item 10's specific ask:
   * "some security checks may have valid evidence even when page content
   * is blocked, such as certain HTTPS/header observations." Whether a page
   * loaded over HTTP is derivable from the URL/response alone, so it
   * remains real evidence even for a page that failed On-Page/Architecture/
   * Performance/Accessibility's own eligibility gate (non-2xx status).
   */
  it('REGRESSION — a blocked (403, ineligible) HTTP page is STILL flagged — the fact survives eligibility exclusion', () => {
    const blocked = makePage({ url: 'http://example.com/', http_status: 403, security_evidence: { isHttps: false } })
    const finding = analyzeNotUsingHttps(pillarContextFor([blocked]))[0]
    expect(finding).toBeDefined()
    expect(finding.affectedPages.map((p) => p.url)).toEqual(['http://example.com/'])
  })

  it('a blocked (403, ineligible) HTTPS page is correctly NOT flagged', () => {
    const blocked = makePage({ url: 'https://example.com/', http_status: 403, security_evidence: { isHttps: true } })
    expect(analyzeNotUsingHttps(pillarContextFor([blocked]))).toEqual([])
  })

  it('flags mixed content references', () => {
    const page = makePage({ url: 'https://example.com/a', security_evidence: { isHttps: true, mixedContentCount: 2 } })
    expect(analyzeMixedContent(pillarContextFor([page]))).toHaveLength(1)
  })

  it('SAFE FIX CONNECTION: emits one instance PER insecure resource URL, keyed by affectedResourceUrl, so the customer sees exactly which reference needs updating', () => {
    const page = makePage({
      url: 'https://example.com/a',
      security_evidence: { isHttps: true, mixedContentCount: 2, mixedContentUrls: ['http://example.com/logo.png', 'http://cdn.example.com/script.js'] },
    })
    const finding = analyzeMixedContent(pillarContextFor([page]))[0]
    expect(finding.affectedPages).toHaveLength(2)
    expect(finding.affectedPages.map((p) => p.affectedResourceUrl).sort()).toEqual(
      ['http://cdn.example.com/script.js', 'http://example.com/logo.png'].sort()
    )
  })

  it('falls back to one page-level instance (no affectedResourceUrl) when the count is non-zero but no URLs were captured (stale evidence)', () => {
    const page = makePage({ url: 'https://example.com/a', security_evidence: { isHttps: true, mixedContentCount: 3, mixedContentUrls: [] } })
    const finding = analyzeMixedContent(pillarContextFor([page]))[0]
    expect(finding.affectedPages).toHaveLength(1)
    expect(finding.affectedPages[0].affectedResourceUrl).toBeNull()
  })

  it('flags insecure form submissions at high severity', () => {
    const page = makePage({ url: 'https://example.com/a', security_evidence: { insecureFormCount: 1 } })
    const finding = analyzeInsecureForms(pillarContextFor([page]))[0]
    expect(finding.baseSeverity).toBe('high')
  })

  it('missing optional security headers is an OPPORTUNITY, never a catastrophic scored problem', () => {
    const page = makePage({
      url: 'https://example.com/a',
      security_evidence: { headers: { strictTransportSecurity: null, contentSecurityPolicy: null, xContentTypeOptions: null, referrerPolicy: null, xFrameOptions: null, permissionsPolicy: null } },
    })
    const finding = analyzeSecurityHeadersOpportunity(pillarContextFor([page]))[0]
    expect(finding.kind).toBe('opportunity')
    expect(finding.baseSeverity).toBe('low')
  })

  it('does not flag a page with every optional header set', () => {
    const page = makePage({
      url: 'https://example.com/a',
      security_evidence: {
        headers: {
          strictTransportSecurity: 'max-age=31536000',
          contentSecurityPolicy: "default-src 'self'",
          xContentTypeOptions: 'nosniff',
          referrerPolicy: 'no-referrer',
          xFrameOptions: 'DENY',
          permissionsPolicy: 'geolocation=()',
        },
      },
    })
    expect(analyzeSecurityHeadersOpportunity(pillarContextFor([page]))).toEqual([])
  })

  it('the hygiene-scope notice never claims the site "is secure"', () => {
    const page = makePage({ url: 'https://example.com/a' })
    const finding = analyzeHygieneScopeNotice(pillarContextFor([page]))[0]
    expect(finding.kind).toBe('opportunity')
    expect(finding.explanation.toLowerCase()).not.toContain('is secure')
    expect(finding.recommendation.toLowerCase()).toContain('penetration test')
  })

  it('emits nothing from the hygiene-scope notice when there are zero eligible pages', () => {
    expect(analyzeHygieneScopeNotice(pillarContextFor([]))).toEqual([])
  })
})
