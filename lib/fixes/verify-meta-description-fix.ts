import 'server-only'
import { fetchPage, getMetaDescriptionContent } from '@/lib/scanner/checks'
import { classifyMetaDescriptionLength, type MetaDescriptionLengthStatus } from '@/lib/scanner/meta-description-rules'
import type { MetaDescriptionIssueKind } from '@/lib/ai/meta-description-recommendation'

export type MetaDescriptionFixVerification =
  | { status: 'verified'; liveValue: string; reason: string }
  | { status: 'still_detected'; liveValue: string | null; reason: string }
  | { status: 'mismatch'; liveValue: string | null; reason: string }
  | { status: 'pending'; liveValue: string | null; reason: string }
  | { status: 'unavailable'; reason: string }

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Mirrors verify-title-fix.ts's isOriginalIssueResolved, using the shared
 * meta-description length classification so this can never drift from what
 * the scanner itself would flag.
 */
function isOriginalIssueResolved(kind: MetaDescriptionIssueKind, liveStatus: MetaDescriptionLengthStatus): boolean {
  if (kind === 'missing') return liveStatus !== 'missing'
  return liveStatus === 'ok'
}

/**
 * Targeted, read-only, single-attempt verification of one just-applied
 * meta-description fix. Fetches the PUBLIC page (never the authenticated
 * WordPress REST API) via the scanner's own fetchPage, and extracts
 * <meta name="description"> via the scanner's own getMetaDescriptionContent
 * — the same parsing rule the scanner itself uses, never duplicated. No
 * credential of any kind is ever attached to this request.
 */
export async function verifyMetaDescriptionFix(input: {
  pageUrl: string
  originalIssueKind: MetaDescriptionIssueKind
  expectedAppliedDescription: string
  previousValue: string | null
}): Promise<MetaDescriptionFixVerification> {
  const { pageUrl, originalIssueKind, expectedAppliedDescription, previousValue } = input

  const fetched = await fetchPage(pageUrl)

  if (!fetched.ok) {
    return { status: 'unavailable', reason: 'The public page could not be checked right now.' }
  }

  if (fetched.finalStatus < 200 || fetched.finalStatus >= 300) {
    return { status: 'unavailable', reason: 'The public page did not return a normal response when checked.' }
  }

  const liveValueRaw = getMetaDescriptionContent(fetched.html)
  const liveStatus = classifyMetaDescriptionLength(liveValueRaw)
  const resolved = isOriginalIssueResolved(originalIssueKind, liveStatus)

  const normalizedExpected = normalizeForComparison(expectedAppliedDescription)
  const normalizedPrevious = previousValue !== null ? normalizeForComparison(previousValue) : ''
  const hasMeaningfulPreviousValue = normalizedPrevious.length > 0
  const normalizedLive = liveValueRaw !== null ? normalizeForComparison(liveValueRaw) : ''

  if (resolved) {
    // classifyMetaDescriptionLength only ever reports something other than
    // 'missing' when getMetaDescriptionContent returned a non-empty string,
    // so `resolved` here guarantees liveValueRaw is a real string.
    const liveValue = liveValueRaw as string

    if (normalizedLive === normalizedExpected) {
      return { status: 'verified', liveValue, reason: 'The public page now reflects the fix.' }
    }

    return {
      status: 'mismatch',
      liveValue,
      reason:
        'WordPress accepted the meta-description update, but the public page is displaying a different description. This can happen if an SEO plugin, theme, or page builder overrides it.',
    }
  }

  // Only treat this as caching if there was a real previous description
  // being served identically — a page that had no description before and
  // still has none now isn't "still serving the old value," it simply
  // still has the original problem.
  if (hasMeaningfulPreviousValue && normalizedLive === normalizedPrevious) {
    return {
      status: 'pending',
      liveValue: liveValueRaw,
      reason:
        'The WordPress update succeeded, but the public page still appears to be serving the previous meta description. This may be caused by caching.',
    }
  }

  return {
    status: 'still_detected',
    liveValue: liveValueRaw,
    reason: 'The public page does not yet reflect a meta description that resolves the original issue.',
  }
}
