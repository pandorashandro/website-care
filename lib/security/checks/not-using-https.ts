import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding } from '@/lib/pillars/types'
import { readSecurityEvidence } from '../evidence'

/**
 * Unified webioom engine, Prompt 2 — pages served over plain HTTP instead
 * of HTTPS. Directly observed from the final response URL's own protocol
 * (see lib/scanner/checks.ts's isHttps) — the clearest, most unambiguous
 * website-security-hygiene fact this engine can check. This is NOT a
 * penetration test and never claims a site IS secure when it passes — only
 * that this one, specific, well-established baseline is or isn't met.
 */
export function analyzeNotUsingHttps(context: PillarAnalyzerContext): RawFinding[] {
  const affected = context.eligiblePages.filter((page) => !readSecurityEvidence(page).isHttps)
  if (affected.length === 0) return []

  return [
    {
      checkKey: 'not_using_https',
      category: 'transport_security',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: 'high',
      confidence: 'high',
      title: 'Some pages are not served over HTTPS',
      explanation: `${affected.length} page${affected.length === 1 ? '' : 's'} webioom analyzed loaded over plain HTTP instead of HTTPS.`,
      whyItMatters: 'Without HTTPS, data between visitors and your site is not encrypted — browsers actively warn visitors about this, and search engines treat it as a negative ranking signal.',
      recommendation: 'Obtain an SSL/TLS certificate (many hosts provide one free) and configure your site to serve every page over HTTPS, redirecting HTTP requests to it.',
      evidence: {},
      actionability: 'developer_required',
      affectedPages: affected.map((page) => ({
        url: page.url,
        currentState: { label: 'Protocol', value: 'HTTP' },
        detail: {},
      })),
    },
  ]
}
