import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding } from '@/lib/pillars/types'
import { readAccessibilityEvidence } from '../evidence'

/** Unified webioom engine, Prompt 2 — `<iframe>` elements with no title attribute — a screen-reader user has no way to know what an embedded frame (e.g. an embedded video or map) contains. */
export function analyzeIframeMissingTitle(context: PillarAnalyzerContext): RawFinding[] {
  const affected = context.eligiblePages
    .map((page) => ({ page, count: readAccessibilityEvidence(page).iframeMissingTitleCount }))
    .filter(({ count }) => count > 0)

  if (affected.length === 0) return []

  return [
    {
      checkKey: 'iframe_missing_title',
      category: 'embedded_content',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: 'low',
      confidence: 'high',
      title: 'Some embedded frames have no title',
      explanation: `${affected.length} page${affected.length === 1 ? '' : 's'} webioom analyzed contain an <iframe> (e.g. an embedded video, map, or widget) with no title attribute.`,
      whyItMatters: 'A screen reader announces embedded frames by their title — without one, a visitor using one has no idea what the embedded content is.',
      recommendation: 'Add a short, descriptive title attribute to each iframe (e.g. title="Product demo video").',
      evidence: {},
      actionability: 'guided_fix',
      affectedPages: affected.map(({ page, count }) => ({
        url: page.url,
        currentState: { label: 'Embedded frames missing a title', value: String(count) },
        detail: { iframeMissingTitleCount: count },
      })),
    },
  ]
}
