import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding, RawFindingPageEvidence } from '@/lib/pillars/types'
import { readAccessibilityEvidence } from '../evidence'

/**
 * Unified webioom engine — images missing an alt attribute entirely (WCAG
 * 1.1.1, the single most well-established, unambiguous static accessibility
 * check that exists). Deliberately does NOT count `alt=""` as missing — an
 * empty alt is the correct, valid markup for a purely decorative image; see
 * lib/scanner/checks.ts's countImagesMissingAlt/getImageSrcsMissingAlt.
 *
 * SAFE FIX CONNECTION (Prompt 3 — closes the Prompt 2 blocker): each
 * affected page now carries one instance PER missing-alt image, keyed by
 * `affectedResourceUrl = image src` (the exact same "affected resource" key
 * convention lib/on-page's duplicate-title/duplicate-meta-description
 * checks already use), rather than a single per-page count. This is what
 * lets `app/dashboard/websites/[id]/accessibility-image-alt-finding.ts`
 * resolve one specific, safely-targetable `(pageUrl, imageSrc)` pair from a
 * `pillar_finding_pages` row id, exactly mirroring how the legacy
 * single-page scanner's own `issues.image_url` column already lets
 * `getTrustedMissingImageAltIssue` do the same for its own table — see that
 * new resolver's own doc comment for the full reuse chain (WordPress
 * source-detection/write/verify/rollback code is entirely unchanged and
 * shared between both entry points).
 *
 * `imagesMissingAltSrcs` is bounded per page (see
 * MAX_MISSING_ALT_SRCS_PER_PAGE in lib/scanner/checks.ts) — a page with more
 * missing-alt images than the cap still reports its full, uncapped COUNT in
 * the finding's explanation/evidence; only the individually-fixable
 * instances are capped, never the honesty of how many exist. A page with a
 * non-zero count but zero captured srcs (e.g. evidence persisted before
 * this field existed) still gets ONE page-level instance with no
 * `affectedResourceUrl`, so the finding is never silently dropped for
 * stale evidence — it simply cannot offer a per-image fix for that page
 * until it is re-crawled.
 */
export function analyzeMissingImageAlt(context: PillarAnalyzerContext): RawFinding[] {
  const affected = context.eligiblePages
    .map((page) => ({ page, evidence: readAccessibilityEvidence(page) }))
    .filter(({ evidence }) => evidence.imagesMissingAltCount > 0)

  if (affected.length === 0) return []

  const totalMissing = affected.reduce((sum, { evidence }) => sum + evidence.imagesMissingAltCount, 0)
  const affectedPageCount = affected.length

  const instances: RawFindingPageEvidence[] = affected.flatMap(({ page, evidence }): RawFindingPageEvidence[] => {
    if (evidence.imagesMissingAltSrcs.length > 0) {
      return evidence.imagesMissingAltSrcs.map(
        (src): RawFindingPageEvidence => ({
          url: page.url,
          affectedResourceUrl: src,
          currentState: { label: 'Alt text', value: null },
          detail: { imagesMissingAltCount: evidence.imagesMissingAltCount },
        })
      )
    }
    // Fallback: a non-zero count with no captured srcs (stale evidence from
    // before this field existed) — still reported, just not per-image yet.
    return [
      {
        url: page.url,
        affectedResourceUrl: null,
        currentState: { label: 'Images missing alt text', value: String(evidence.imagesMissingAltCount) },
        detail: { imagesMissingAltCount: evidence.imagesMissingAltCount },
      },
    ]
  })

  return [
    {
      checkKey: 'images_missing_alt',
      category: 'images',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Some images have no alt text',
      explanation: `${totalMissing} image${totalMissing === 1 ? '' : 's'} across ${affectedPageCount} page${affectedPageCount === 1 ? '' : 's'} have no alt attribute at all — screen-reader users have no way to know what these images show.`,
      whyItMatters: 'Alt text lets people using screen readers understand images, and also helps search engines understand what an image shows.',
      recommendation: 'Add a short, descriptive alt attribute to each image describing what it shows (or alt="" specifically for purely decorative images).',
      evidence: {},
      // Prompt 3: connected to the real WordPress image-alt Safe Fix
      // pipeline where a specific image src was captured (see
      // accessibility-image-alt-finding.ts) — 'guided_fix' remains the
      // honest fallback for Shopify/Wix (neither supports image-alt at
      // all — see lib/integrations/{shopify,wix}/issue-fixability.ts) and
      // for stale per-page-only evidence with no captured src.
      actionability: 'guided_fix',
      affectedPages: instances,
    },
  ]
}
