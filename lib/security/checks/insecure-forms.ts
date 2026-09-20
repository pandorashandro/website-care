import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding } from '@/lib/pillars/types'
import { readSecurityEvidence } from '../evidence'

/** Unified webioom engine, Prompt 2 — a `<form action="http://...">` that submits its data over plain HTTP. Directly observed from markup — a real, high-severity finding since form submissions often carry sensitive visitor data (contact details, login credentials). */
export function analyzeInsecureForms(context: PillarAnalyzerContext): RawFinding[] {
  const affected = context.eligiblePages
    .map((page) => ({ page, count: readSecurityEvidence(page).insecureFormCount }))
    .filter(({ count }) => count > 0)

  if (affected.length === 0) return []

  return [
    {
      checkKey: 'insecure_forms',
      category: 'transport_security',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: 'high',
      confidence: 'high',
      title: 'Some forms submit data over plain HTTP',
      explanation: `${affected.length} page${affected.length === 1 ? '' : 's'} webioom analyzed contain a form that submits to an http:// address instead of https://.`,
      whyItMatters: 'Data submitted through an insecure form (names, emails, messages, or worse, passwords/payment details) is not encrypted in transit.',
      recommendation: 'Update the form\'s action attribute to an https:// address, and ensure the page itself is served over HTTPS.',
      evidence: {},
      actionability: 'developer_required',
      affectedPages: affected.map(({ page, count }) => ({
        url: page.url,
        currentState: { label: 'Insecure form submissions', value: String(count) },
        detail: { insecureFormCount: count },
      })),
    },
  ]
}
