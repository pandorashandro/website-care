import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding } from '@/lib/pillars/types'
import { readPerformanceEvidence } from '../evidence'

/** Unified webioom engine, Prompt 2 — a page loading an unusually large number of separate script/stylesheet resources, each an extra network round-trip before the page is fully ready. */
const EXCESSIVE_RESOURCE_THRESHOLD = 15

export function analyzeExcessiveResourceCount(context: PillarAnalyzerContext): RawFinding[] {
  const affected = context.eligiblePages
    .map((page) => ({ page, evidence: readPerformanceEvidence(page) }))
    .filter(({ evidence }) => evidence.scriptCount + evidence.stylesheetCount >= EXCESSIVE_RESOURCE_THRESHOLD)

  if (affected.length === 0) return []

  return [
    {
      checkKey: 'excessive_resource_count',
      category: 'resource_burden',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: 'low',
      confidence: 'high',
      title: 'Some pages load an unusually large number of scripts and stylesheets',
      explanation: `${affected.length} page${affected.length === 1 ? '' : 's'} webioom analyzed load ${EXCESSIVE_RESOURCE_THRESHOLD}+ separate script/stylesheet files, each requiring its own network request before the page is fully ready.`,
      whyItMatters: 'Many small separate resource requests add up, especially on slower connections — each one has its own connection/download overhead.',
      recommendation: 'Consider combining or removing unused scripts and stylesheets, or loading non-essential ones only when needed.',
      evidence: {},
      actionability: 'guided_fix',
      affectedPages: affected.map(({ page, evidence }) => ({
        url: page.url,
        currentState: { label: 'Scripts + stylesheets', value: String(evidence.scriptCount + evidence.stylesheetCount) },
        detail: { scriptCount: evidence.scriptCount, stylesheetCount: evidence.stylesheetCount },
      })),
    },
  ]
}
