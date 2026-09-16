import type { CrawlEvidence } from '../evidence'
import type { RawFinding } from '../types'

/**
 * Phase 26B — structured data (JSON-LD). Checks JSON-SYNTAX validity only
 * (via the built-in JSON.parse, in lib/crawler/page-extract.ts) — this is
 * deliberately NOT schema.org semantic validation or Google Rich Results
 * eligibility checking, neither of which webioom implements. A page with
 * perfectly valid, well-formed JSON that is nonetheless semantically wrong
 * schema.org markup is NOT flagged here — only genuinely broken JSON is,
 * which is the one thing this evidence can support with full confidence.
 */
export function analyzeStructuredData(evidence: CrawlEvidence): RawFinding[] {
  const invalidPages = evidence.pages.filter((page) => page.status === 'completed' && page.structured_data_present && page.structured_data_valid === false)

  if (invalidPages.length === 0) return []

  return [
    {
      checkKey: 'structured_data_invalid',
      category: 'structured_data',
      scope: 'page',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Pages contain invalid structured data',
      explanation: `${invalidPages.length} page${invalidPages.length === 1 ? '' : 's'} ${invalidPages.length === 1 ? 'has' : 'have'} a JSON-LD structured data block that is not valid JSON.`,
      whyItMatters: 'Search engines cannot read structured data that fails to parse, so the page loses any rich-result eligibility that markup was meant to provide.',
      recommendation: 'Fix the JSON syntax in the structured data block (check for a missing comma, bracket, or quote).',
      evidence: {},
      affectedPages: invalidPages.map((page) => ({
        url: page.url,
        currentState: { label: 'Structured data', value: page.structured_data_error ?? 'invalid JSON' },
        desiredState: { label: 'Structured data', value: 'valid JSON-LD' },
        remediationType: 'schema_correction',
        detail: { error: page.structured_data_error },
      })),
    },
  ]
}
