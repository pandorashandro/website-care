import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding } from '@/lib/pillars/types'
import { readPerformanceEvidence } from '../evidence'

/** Unified webioom engine, Prompt 2 — images missing explicit width/height, a well-established, directly-measurable cause of layout shift (the browser cannot reserve space for the image before it loads). */
export function analyzeImageDimensions(context: PillarAnalyzerContext): RawFinding[] {
  const affected = context.eligiblePages
    .map((page) => ({ page, count: readPerformanceEvidence(page).imagesMissingDimensionsCount }))
    .filter(({ count }) => count > 0)

  if (affected.length === 0) return []

  return [
    {
      checkKey: 'images_missing_dimensions',
      category: 'layout_stability',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: 'low',
      confidence: 'high',
      title: 'Some images are missing width/height attributes',
      explanation: `${affected.length} page${affected.length === 1 ? '' : 's'} webioom analyzed contain images with no explicit width/height — the browser cannot reserve space for them before they load, which can shift the page layout as they appear.`,
      whyItMatters: 'Unexpected layout shifts are disruptive for visitors — content can move while they are reading or about to click something.',
      recommendation: 'Add explicit width and height attributes (matching the image\'s aspect ratio) to every image tag.',
      evidence: {},
      actionability: 'guided_fix',
      affectedPages: affected.map(({ page, count }) => ({
        url: page.url,
        currentState: { label: 'Images missing dimensions', value: String(count) },
        detail: { imagesMissingDimensionsCount: count },
      })),
    },
  ]
}
