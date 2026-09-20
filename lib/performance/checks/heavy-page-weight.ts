import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding } from '@/lib/pillars/types'
import { readPerformanceEvidence } from '../evidence'

/**
 * Unified webioom engine, Prompt 2 — heavy page response weight.
 *
 * Directly measured, not inferred: `response_size_bytes` is the actual
 * number of bytes this crawl's own fetch received for the page (see
 * lib/scanner/checks.ts's fetchPage) — no estimation, no fabricated
 * precision. A genuinely heavy HTML response is real evidence of slow
 * loading regardless of network conditions; deliberately conservative
 * thresholds so this only fires for pages meaningfully outside normal
 * range, not routine variation.
 *
 * PAYABLE-V1 remediation-depth pass: `response_size_bytes` is a single
 * total with no per-resource-type breakdown (webioom fetches the page's
 * own HTML, never every referenced image/script/stylesheet individually,
 * so attributing "X% of this weight is images" would be fabricated
 * precision this crawl cannot actually support). Rather than inventing
 * that breakdown, this now surfaces the SAME page's own already-computed
 * script/stylesheet counts (PerformanceEvidence, read once at crawl time,
 * previously discarded by this specific check) as a genuine, evidence-based
 * starting point alongside the generic "common causes" text — a real
 * number the customer can act on, not a guess about what is actually heavy.
 */
const HEAVY_PAGE_BYTES = 2_000_000 // 2 MB
const VERY_HEAVY_PAGE_BYTES = 5_000_000 // 5 MB

export function analyzeHeavyPageWeight(context: PillarAnalyzerContext): RawFinding[] {
  const affected = context.eligiblePages.filter((page) => (page.response_size_bytes ?? 0) >= HEAVY_PAGE_BYTES)
  if (affected.length === 0) return []

  const anyVeryHeavy = affected.some((page) => (page.response_size_bytes ?? 0) >= VERY_HEAVY_PAGE_BYTES)

  return [
    {
      checkKey: 'heavy_page_response',
      category: 'page_weight',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: anyVeryHeavy ? 'high' : 'medium',
      confidence: 'high',
      title: 'Some pages are unusually heavy',
      explanation: `${affected.length} page${affected.length === 1 ? '' : 's'} webioom analyzed returned an unusually large amount of data (over ${Math.round(HEAVY_PAGE_BYTES / 1_000_000)}MB), which typically means slower load times for visitors.`,
      whyItMatters: 'Heavier pages take longer to download, especially on slower connections or mobile devices — this can lead visitors to leave before the page finishes loading.',
      recommendation:
        'Review what makes these pages large — oversized images, excessive scripts/styles, or embedded media are common causes. The script and stylesheet counts for each affected page are shown below as a starting point; also check image file sizes, since webioom does not currently measure individual resource sizes.',
      evidence: {},
      actionability: 'guided_fix',
      affectedPages: affected.map((page) => {
        const performanceEvidence = readPerformanceEvidence(page)
        return {
          url: page.url,
          currentState: { label: 'Page size', value: `${((page.response_size_bytes ?? 0) / 1_000_000).toFixed(1)} MB` },
          detail: {
            responseSizeBytes: page.response_size_bytes,
            scriptCount: performanceEvidence.scriptCount,
            stylesheetCount: performanceEvidence.stylesheetCount,
          },
        }
      }),
    },
  ]
}
