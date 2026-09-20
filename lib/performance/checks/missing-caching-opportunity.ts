import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding } from '@/lib/pillars/types'
import { readPerformanceEvidence } from '../evidence'

/**
 * Unified webioom engine, Prompt 2 — no Cache-Control header at all. An
 * OPPORTUNITY, not a scored problem: many pages are legitimately dynamic
 * and correctly uncached (a checkout page, a logged-in dashboard), so a
 * missing Cache-Control header alone is not confident evidence of a real
 * defect — only that browser caching has not been explicitly configured.
 */
export function analyzeMissingCachingOpportunity(context: PillarAnalyzerContext): RawFinding[] {
  const affected = context.eligiblePages.filter((page) => !readPerformanceEvidence(page).responseCacheControl)
  if (affected.length === 0) return []

  return [
    {
      checkKey: 'missing_caching_headers',
      category: 'server_configuration',
      scope: 'page',
      kind: 'opportunity',
      evidenceSource: 'deterministic',
      baseSeverity: 'low',
      confidence: 'low',
      title: 'Some pages have no browser caching configured',
      explanation: `${affected.length} page${affected.length === 1 ? '' : 's'} webioom analyzed have no Cache-Control response header — returning visitors re-download the full page every time instead of reusing a cached copy.`,
      whyItMatters: 'For pages that do not change often, caching lets returning visitors load them instantly from their browser instead of downloading them again.',
      recommendation: 'Consider adding a Cache-Control header with an appropriate lifetime for pages that do not need to be fetched fresh on every visit.',
      evidence: {},
      actionability: 'developer_required',
      affectedPages: affected.map((page) => ({
        url: page.url,
        currentState: { label: 'Cache-Control', value: 'Not set' },
        detail: {},
      })),
    },
  ]
}
