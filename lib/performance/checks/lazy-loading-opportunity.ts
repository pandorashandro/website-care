import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding } from '@/lib/pillars/types'
import { readPerformanceEvidence } from '../evidence'

/**
 * Unified webioom engine, Prompt 2 — lazy-loading opportunity. An
 * OPPORTUNITY, not a problem (see lib/pillars/health.ts): images beyond the
 * first few (see lib/scanner/checks.ts's LAZY_LOAD_EXEMPT_IMAGE_COUNT,
 * which deliberately never flags likely-above-the-fold images) that could
 * defer loading until needed — a suggestion for already-working pages, not
 * a defect.
 *
 * PAYABLE-V1 remediation-depth pass — actionability correction:
 * `kind: 'opportunity'` (a health-scoring concept — this never reduces
 * Performance Health) is a different axis from `actionability` (whether
 * webioom can give a concrete, evidence-based step). This finding has an
 * exact affected-image count per page and a single, safe, well-established
 * fix (`loading="lazy"`) — nothing about it requires guessing intent or
 * more evidence than webioom already has, so it does not meet the
 * `monitor` bar ("automation would require guessing intent or evidence is
 * insufficient"). Corrected to `guided_fix`, matching every other
 * Performance finding with an equally concrete markup-level fix
 * (excessive_resource_count, images_missing_dimensions,
 * render_blocking_scripts) — this does not add any new automated
 * execution, only an honest label for guidance webioom already gives.
 */
export function analyzeLazyLoadingOpportunity(context: PillarAnalyzerContext): RawFinding[] {
  const affected = context.eligiblePages
    .map((page) => ({ page, count: readPerformanceEvidence(page).imagesMissingLazyLoadingCount }))
    .filter(({ count }) => count > 0)

  if (affected.length === 0) return []

  return [
    {
      checkKey: 'lazy_loading_opportunity',
      category: 'resource_burden',
      scope: 'page',
      kind: 'opportunity',
      evidenceSource: 'deterministic',
      baseSeverity: 'low',
      confidence: 'low',
      title: 'Some pages could lazy-load more images',
      explanation: `${affected.length} page${affected.length === 1 ? '' : 's'} webioom analyzed have images further down the page that could load lazily instead of immediately.`,
      whyItMatters: 'Deferring images that are not immediately visible lets the page become usable sooner — this is a suggestion for already-working pages, not a sign anything is wrong.',
      recommendation: 'Add `loading="lazy"` to images that appear below the initial visible area of the page.',
      evidence: {},
      actionability: 'guided_fix',
      affectedPages: affected.map(({ page, count }) => ({
        url: page.url,
        currentState: { label: 'Images that could lazy-load', value: String(count) },
        detail: { imagesMissingLazyLoadingCount: count },
      })),
    },
  ]
}
