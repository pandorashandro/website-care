import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding } from '@/lib/pillars/types'

/**
 * Unified webioom engine, Prompt 2 — the honest, always-on notice
 * distinguishing what this engine actually detected from what it
 * structurally cannot verify. This phase's own explicit instruction: "Do
 * NOT pretend static HTML analysis can prove keyboard behavior,
 * screen-reader usability, color contrast, focus behavior, dynamic ARIA
 * behavior... The engine must clearly distinguish detected accessibility
 * problems from areas requiring interactive/manual testing." Never
 * WCAG-compliance-claiming language, in either direction.
 */
export function analyzeManualTestingNotice(context: PillarAnalyzerContext): RawFinding[] {
  if (context.eligiblePages.length === 0) return []

  return [
    {
      checkKey: 'accessibility_manual_testing_required',
      category: 'measurement_scope',
      scope: 'site',
      kind: 'opportunity',
      evidenceSource: 'deterministic',
      baseSeverity: 'low',
      confidence: 'high',
      title: 'Some accessibility areas require manual or interactive testing',
      explanation:
        'webioom checks what can be reliably determined from your pages\' markup alone (missing alt text, unlabeled form fields, missing language, and similar). It does not test keyboard navigation, screen-reader usability, color contrast, focus behavior, or dynamic/JavaScript-driven interactions — those require a person (or specialized tooling) actually using the page.',
      whyItMatters: 'A clean report above does not mean your site is fully accessible — it means these specific, static checks found nothing wrong. This is not a WCAG compliance claim.',
      recommendation: 'For a complete picture, pair these findings with manual testing: try navigating your site by keyboard only, and check color contrast on your key pages.',
      evidence: {},
      actionability: 'monitor',
      affectedPages: [],
    },
  ]
}
