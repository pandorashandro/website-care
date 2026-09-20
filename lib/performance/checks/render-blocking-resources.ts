import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding } from '@/lib/pillars/types'
import { readPerformanceEvidence } from '../evidence'

/**
 * Unified webioom engine, Prompt 2 — render-blocking `<head>` scripts.
 * Directly measured from markup (script tags with neither `async` nor
 * `defer`) — a well-established, purely structural browser-rendering fact,
 * not an inference. See lib/scanner/checks.ts's
 * countRenderBlockingHeadScripts.
 */
const RENDER_BLOCKING_THRESHOLD = 2

export function analyzeRenderBlockingResources(context: PillarAnalyzerContext): RawFinding[] {
  const affected = context.eligiblePages.filter((page) => readPerformanceEvidence(page).renderBlockingScriptCount >= RENDER_BLOCKING_THRESHOLD)
  if (affected.length === 0) return []

  return [
    {
      checkKey: 'render_blocking_scripts',
      category: 'render_blocking',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Some pages load multiple render-blocking scripts',
      explanation: `${affected.length} page${affected.length === 1 ? '' : 's'} webioom analyzed load ${RENDER_BLOCKING_THRESHOLD}+ scripts in the page's <head> without async or defer, which delays the page from rendering until they finish loading.`,
      whyItMatters: 'Render-blocking scripts delay everything visitors see on the page — the browser has to download and run them before it can display the content beneath them.',
      recommendation: 'Add the `defer` (or `async`, where order does not matter) attribute to these scripts, or move them to just before the closing </body> tag.',
      evidence: {},
      actionability: 'guided_fix',
      affectedPages: affected.map((page) => ({
        url: page.url,
        currentState: { label: 'Render-blocking scripts', value: String(readPerformanceEvidence(page).renderBlockingScriptCount) },
        detail: { renderBlockingScriptCount: readPerformanceEvidence(page).renderBlockingScriptCount },
      })),
    },
  ]
}
