import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding } from '@/lib/pillars/types'
import { readAccessibilityEvidence } from '../evidence'

/** Unified webioom engine, Prompt 2 — links with no visible text and no aria-label/aria-labelledby/title (WCAG 2.4.4/4.1.2) — typically an icon-only link a screen-reader user cannot identify. */
export function analyzeLinksMissingAccessibleName(context: PillarAnalyzerContext): RawFinding[] {
  const affected = context.eligiblePages
    .map((page) => ({ page, count: readAccessibilityEvidence(page).linksMissingAccessibleNameCount }))
    .filter(({ count }) => count > 0)

  if (affected.length === 0) return []

  return [
    {
      checkKey: 'links_missing_accessible_name',
      category: 'navigation',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Some links have no accessible name',
      explanation: `${affected.length} page${affected.length === 1 ? '' : 's'} webioom analyzed contain links with no visible text and no aria-label — often an icon-only link a screen-reader user cannot identify.`,
      whyItMatters: 'A screen reader announces a link by its text or aria-label — with neither, a visitor using one hears nothing useful about where the link goes.',
      recommendation: 'Add an aria-label describing the link\'s destination/purpose (e.g. aria-label="Close menu"), or include visible text.',
      evidence: {},
      actionability: 'guided_fix',
      affectedPages: affected.map(({ page, count }) => ({
        url: page.url,
        currentState: { label: 'Links missing an accessible name', value: String(count) },
        detail: { linksMissingAccessibleNameCount: count },
      })),
    },
  ]
}
