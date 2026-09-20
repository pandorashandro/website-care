import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding } from '@/lib/pillars/types'
import { readAccessibilityEvidence } from '../evidence'

/** Unified webioom engine, Prompt 2 — duplicate `id` attributes on the same page (WCAG 4.1.1) — can break `label for`/ARIA references and fragment-link navigation, both of which rely on ids being unique. Lower severity: a real defect, but often a technical validity issue more than a direct blocker. */
export function analyzeDuplicateIds(context: PillarAnalyzerContext): RawFinding[] {
  const affected = context.eligiblePages
    .map((page) => ({ page, count: readAccessibilityEvidence(page).duplicateIdCount }))
    .filter(({ count }) => count > 0)

  if (affected.length === 0) return []

  return [
    {
      checkKey: 'duplicate_element_ids',
      category: 'document_structure',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: 'low',
      confidence: 'high',
      title: 'Some pages have duplicate element ids',
      explanation: `${affected.length} page${affected.length === 1 ? '' : 's'} webioom analyzed contain more than one element with the same id attribute.`,
      whyItMatters: 'Duplicate ids can break label/ARIA references and in-page links, which rely on an id uniquely identifying one element.',
      recommendation: 'Make each id attribute unique on the page.',
      evidence: {},
      actionability: 'developer_required',
      affectedPages: affected.map(({ page, count }) => ({
        url: page.url,
        currentState: { label: 'Duplicate ids found', value: String(count) },
        detail: { duplicateIdCount: count },
      })),
    },
  ]
}
