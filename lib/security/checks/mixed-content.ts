import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding, RawFindingPageEvidence } from '@/lib/pillars/types'
import { readSecurityEvidence } from '../evidence'

/**
 * Unified webioom engine, Prompt 2 — an https page referencing plain
 * http:// resources (images/scripts/styles/etc.). Browsers actively block
 * or warn on this ("mixed content"), a genuine, directly-observed hygiene
 * defect.
 *
 * PAYABLE-V1 remediation-depth pass: each affected page now carries one
 * instance PER captured insecure resource URL (mirroring lib/accessibility/
 * checks/missing-image-alt.ts's own per-image pattern) instead of only a
 * count, so the customer sees exactly WHICH http:// reference needs
 * updating rather than "some resource, somewhere." `mixedContentUrls` is
 * bounded per page (see MAX_MIXED_CONTENT_URLS_PER_PAGE in
 * lib/scanner/checks.ts) — a page with more insecure references than the
 * cap still reports its full, uncapped COUNT in the explanation; only the
 * individually-named instances are capped. A page with a non-zero count
 * but zero captured URLs (stale evidence from before this field existed)
 * still gets one page-level instance with no affectedResourceUrl, so the
 * finding is never silently dropped.
 */
export function analyzeMixedContent(context: PillarAnalyzerContext): RawFinding[] {
  const affected = context.eligiblePages
    .map((page) => ({ page, evidence: readSecurityEvidence(page) }))
    .filter(({ evidence }) => evidence.mixedContentCount > 0)

  if (affected.length === 0) return []

  const totalCount = affected.reduce((sum, { evidence }) => sum + evidence.mixedContentCount, 0)
  const affectedPageCount = affected.length

  const instances: RawFindingPageEvidence[] = affected.flatMap(({ page, evidence }): RawFindingPageEvidence[] => {
    if (evidence.mixedContentUrls.length > 0) {
      return evidence.mixedContentUrls.map(
        (url): RawFindingPageEvidence => ({
          url: page.url,
          affectedResourceUrl: url,
          currentState: { label: 'Insecure resource', value: url },
          detail: { mixedContentCount: evidence.mixedContentCount },
        })
      )
    }
    return [
      {
        url: page.url,
        affectedResourceUrl: null,
        currentState: { label: 'Insecure resource references', value: String(evidence.mixedContentCount) },
        detail: { mixedContentCount: evidence.mixedContentCount },
      },
    ]
  })

  return [
    {
      checkKey: 'mixed_content',
      category: 'transport_security',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Some HTTPS pages reference insecure (HTTP) resources',
      explanation: `${totalCount} insecure resource reference${totalCount === 1 ? '' : 's'} across ${affectedPageCount} page${affectedPageCount === 1 ? '' : 's'} webioom analyzed are served over HTTPS but reference at least one resource (image, script, or similar) over plain HTTP.`,
      whyItMatters: 'Browsers may block these resources or warn visitors about "mixed content", which can break parts of the page and undermine trust in the padlock icon.',
      recommendation: 'Update each resource reference listed below to use an https:// URL (or a protocol-relative/relative URL) instead of http://.',
      evidence: {},
      actionability: 'guided_fix',
      affectedPages: instances,
    },
  ]
}
