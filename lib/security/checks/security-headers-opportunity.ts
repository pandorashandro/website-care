import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding } from '@/lib/pillars/types'
import { readSecurityEvidence } from '../evidence'

/**
 * Unified webioom engine, Prompt 2 — optional defense-in-depth response
 * headers (Strict-Transport-Security, Content-Security-Policy,
 * X-Content-Type-Options, Referrer-Policy, frame protection via
 * X-Frame-Options, Permissions-Policy). Deliberately an OPPORTUNITY, not a
 * scored problem — per this phase's own explicit calibration instruction:
 * "Missing optional defense-in-depth headers must not automatically become
 * catastrophic security findings." Absence of these headers does not mean
 * a site is insecure; presence of all of them does not mean it is "secure"
 * either — this check names specifically which headers are missing,
 * never a blanket security verdict.
 */
type HeaderCheck = { key: keyof ReturnType<typeof readSecurityEvidence>['headers']; label: string }

const CHECKED_HEADERS: HeaderCheck[] = [
  { key: 'strictTransportSecurity', label: 'Strict-Transport-Security' },
  { key: 'contentSecurityPolicy', label: 'Content-Security-Policy' },
  { key: 'xContentTypeOptions', label: 'X-Content-Type-Options' },
  { key: 'referrerPolicy', label: 'Referrer-Policy' },
  { key: 'xFrameOptions', label: 'X-Frame-Options (or CSP frame-ancestors)' },
  { key: 'permissionsPolicy', label: 'Permissions-Policy' },
]

export function analyzeSecurityHeadersOpportunity(context: PillarAnalyzerContext): RawFinding[] {
  const affected = context.eligiblePages
    .map((page) => {
      const headers = readSecurityEvidence(page).headers
      const missing = CHECKED_HEADERS.filter(({ key }) => !headers[key]).map(({ label }) => label)
      return { page, missing }
    })
    .filter(({ missing }) => missing.length > 0)

  if (affected.length === 0) return []

  return [
    {
      checkKey: 'security_headers_opportunity',
      category: 'response_headers',
      scope: 'page',
      kind: 'opportunity',
      evidenceSource: 'deterministic',
      baseSeverity: 'low',
      confidence: 'medium',
      title: 'Some optional security headers are not set',
      explanation: `${affected.length} page${affected.length === 1 ? '' : 's'} webioom analyzed are missing one or more optional defense-in-depth response headers.`,
      whyItMatters: 'These headers add extra layers of protection (e.g. against clickjacking or content-sniffing attacks) — they are good hardening practice, not evidence of an active vulnerability.',
      recommendation: 'Consider configuring the missing headers listed for each page in your server or hosting/CDN configuration.',
      evidence: {},
      actionability: 'developer_required',
      affectedPages: affected.map(({ page, missing }) => ({
        url: page.url,
        currentState: { label: 'Missing headers', value: missing.join(', ') },
        detail: { missingHeaders: missing },
      })),
    },
  ]
}
