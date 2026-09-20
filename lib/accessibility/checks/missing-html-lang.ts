import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding } from '@/lib/pillars/types'
import { readAccessibilityEvidence } from '../evidence'

/** Unified webioom engine, Prompt 2 — a missing/empty <html lang> attribute (WCAG 3.1.1) — screen readers cannot reliably choose the correct pronunciation/voice without it. Fully static, zero-ambiguity check. */
export function analyzeMissingHtmlLang(context: PillarAnalyzerContext): RawFinding[] {
  const affected = context.eligiblePages.filter((page) => !readAccessibilityEvidence(page).htmlLang)
  if (affected.length === 0) return []

  return [
    {
      checkKey: 'missing_html_lang',
      category: 'document_structure',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Some pages do not declare a language',
      explanation: `${affected.length} page${affected.length === 1 ? '' : 's'} webioom analyzed have no lang attribute on the <html> element.`,
      whyItMatters: 'Without a declared language, screen readers may use the wrong pronunciation, and browsers cannot reliably offer translation.',
      recommendation: 'Add a lang attribute to the <html> tag matching the page\'s primary language (e.g. lang="en").',
      evidence: {},
      actionability: 'guided_fix',
      affectedPages: affected.map((page) => ({
        url: page.url,
        currentState: { label: 'HTML lang attribute', value: 'Not set' },
        detail: {},
      })),
    },
  ]
}
