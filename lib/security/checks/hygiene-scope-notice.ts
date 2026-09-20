import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding } from '@/lib/pillars/types'

/**
 * Unified webioom engine, Prompt 2 — the honest, always-on notice that this
 * engine performs passive, publicly-observable website-security-HYGIENE
 * checks only — never a penetration test, never a vulnerability scan,
 * never a claim that a site "is secure." Mirrors
 * lib/accessibility/checks/manual-testing-notice.ts's own reasoning: a
 * clean report communicates "these specific hygiene checks found nothing,"
 * never "this site has no vulnerabilities."
 */
export function analyzeHygieneScopeNotice(context: PillarAnalyzerContext): RawFinding[] {
  if (context.eligiblePages.length === 0) return []

  return [
    {
      checkKey: 'security_hygiene_scope_notice',
      category: 'measurement_scope',
      scope: 'site',
      kind: 'opportunity',
      evidenceSource: 'deterministic',
      baseSeverity: 'low',
      confidence: 'high',
      title: 'This is a website security hygiene check, not a penetration test',
      explanation:
        'webioom checks publicly observable signals — HTTPS usage, mixed content, insecure forms, and common response headers. It does not probe your infrastructure, attempt to exploit anything, or test for specific vulnerabilities.',
      whyItMatters: 'A clean result above means these specific hygiene checks found nothing — it is not a guarantee your site has no security vulnerabilities.',
      recommendation: 'For a deeper security assessment, consider a dedicated security audit or penetration test alongside webioom\'s hygiene findings.',
      evidence: {},
      actionability: 'monitor',
      affectedPages: [],
    },
  ]
}
