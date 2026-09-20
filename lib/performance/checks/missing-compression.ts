import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding } from '@/lib/pillars/types'
import { readPerformanceEvidence } from '../evidence'

/**
 * Unified webioom engine, Prompt 2 — missing response compression.
 * Directly observed from the `Content-Encoding` response header (see
 * lib/scanner/checks.ts's fetchPage) — never inferred. Only evaluated for
 * pages above a minimum size (a tiny page genuinely doesn't need
 * compression, so flagging it would be noise, not a real finding).
 */
const MIN_BYTES_TO_EXPECT_COMPRESSION = 50_000

export function analyzeMissingCompression(context: PillarAnalyzerContext): RawFinding[] {
  const affected = context.eligiblePages.filter(
    (page) => (page.response_size_bytes ?? 0) >= MIN_BYTES_TO_EXPECT_COMPRESSION && !readPerformanceEvidence(page).responseContentEncoding
  )
  if (affected.length === 0) return []

  return [
    {
      checkKey: 'missing_compression',
      category: 'server_configuration',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Some pages are served without compression',
      explanation: `${affected.length} page${affected.length === 1 ? '' : 's'} webioom analyzed (each over ${Math.round(MIN_BYTES_TO_EXPECT_COMPRESSION / 1000)}KB) were served with no Content-Encoding (e.g. gzip or brotli) — the response could likely be transferred using significantly less data.`,
      whyItMatters: 'Compressing text-based responses (HTML, CSS, JS) typically shrinks them dramatically, reducing load time for every visitor with no downside.',
      recommendation: 'Enable gzip or brotli compression on your web server or hosting/CDN configuration.',
      evidence: {},
      actionability: 'developer_required',
      affectedPages: affected.map((page) => ({
        url: page.url,
        currentState: { label: 'Content-Encoding', value: 'None' },
        detail: { responseSizeBytes: page.response_size_bytes },
      })),
    },
  ]
}
