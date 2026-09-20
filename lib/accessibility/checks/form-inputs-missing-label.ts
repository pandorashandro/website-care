import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding } from '@/lib/pillars/types'
import { readAccessibilityEvidence } from '../evidence'

/** Unified webioom engine, Prompt 2 — form fields with no associated label, aria-label, aria-labelledby, or title (WCAG 4.1.2/1.3.1). Severity is 'high' — a screen-reader user genuinely cannot tell what an unlabeled form field is for, which can block completing the form entirely. */
export function analyzeFormInputsMissingLabel(context: PillarAnalyzerContext): RawFinding[] {
  const affected = context.eligiblePages
    .map((page) => ({ page, count: readAccessibilityEvidence(page).formInputsMissingLabelCount }))
    .filter(({ count }) => count > 0)

  if (affected.length === 0) return []

  return [
    {
      checkKey: 'form_inputs_missing_label',
      category: 'forms',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: 'high',
      confidence: 'high',
      title: 'Some form fields have no label',
      explanation: `${affected.length} page${affected.length === 1 ? '' : 's'} webioom analyzed contain form fields with no associated label — a screen-reader user would not know what information to enter.`,
      whyItMatters: 'An unlabeled form field can make it impossible for a screen-reader user to know what to type, which can block them from completing the form at all.',
      recommendation: 'Add a <label for="..."> matching each field\'s id, or an aria-label attribute directly on the field.',
      evidence: {},
      actionability: 'guided_fix',
      affectedPages: affected.map(({ page, count }) => ({
        url: page.url,
        currentState: { label: 'Form fields missing a label', value: String(count) },
        detail: { formInputsMissingLabelCount: count },
      })),
    },
  ]
}
