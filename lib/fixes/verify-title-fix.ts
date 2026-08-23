import 'server-only'
import { fetchPage, getTitleText } from '@/lib/scanner/checks'
import { classifyTitleLength, type TitleLengthStatus } from '@/lib/scanner/title-rules'
import type { TitleIssueKind } from './title-preview'

export type TitleFixVerification =
  | { status: 'verified'; liveTitle: string; reason: string }
  | { status: 'still_detected'; liveTitle: string | null; reason: string }
  | { status: 'mismatch'; liveTitle: string | null; reason: string }
  | { status: 'pending'; liveTitle: string | null; reason: string }
  | { status: 'unavailable'; reason: string }

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Whether the specific problem that caused `kind` to be detected no longer
 * holds on the live page, using the scanner's own length classification
 * (lib/scanner/title-rules.ts) so this can never drift from what the scanner
 * itself would flag. A page fixed for "missing title" only needs a non-empty
 * title to count as resolved (matching what the scanner would no longer flag
 * as missing) — a too-short/too-long fix needs the live title to land fully
 * within the scanner's valid range.
 */
function isOriginalIssueResolved(kind: TitleIssueKind, liveStatus: TitleLengthStatus): boolean {
  if (kind === 'missing') return liveStatus !== 'missing'
  return liveStatus === 'ok'
}

/**
 * Targeted, read-only, single-attempt verification of one just-applied
 * WordPress title fix. Fetches the PUBLIC page (never the authenticated
 * WordPress REST API) using the scanner's own fetchPage — the same SSRF
 * guard, redirect re-validation, timeout, and HTTPS handling as a normal
 * scan, and no credentials of any kind, since fetchPage never attaches an
 * Authorization header. A failed WordPress write must never reach this
 * function; a failure to verify never implies the write itself failed.
 */
export async function verifyTitleFix(input: {
  pageUrl: string
  originalIssueKind: TitleIssueKind
  expectedAppliedTitle: string
  previousValue: string | null
}): Promise<TitleFixVerification> {
  const { pageUrl, originalIssueKind, expectedAppliedTitle, previousValue } = input

  const fetched = await fetchPage(pageUrl)

  if (!fetched.ok) {
    return { status: 'unavailable', reason: 'The public page could not be checked right now.' }
  }

  if (fetched.finalStatus < 200 || fetched.finalStatus >= 300) {
    return { status: 'unavailable', reason: 'The public page did not return a normal response when checked.' }
  }

  const liveTitleRaw = getTitleText(fetched.html)
  const liveStatus = classifyTitleLength(liveTitleRaw)
  const resolved = isOriginalIssueResolved(originalIssueKind, liveStatus)

  const normalizedExpected = normalizeForComparison(expectedAppliedTitle)
  const normalizedPrevious = previousValue !== null ? normalizeForComparison(previousValue) : ''
  const hasMeaningfulPreviousValue = normalizedPrevious.length > 0
  const normalizedLive = liveTitleRaw !== null ? normalizeForComparison(liveTitleRaw) : ''

  if (resolved) {
    // classifyTitleLength only ever reports something other than 'missing'
    // when getTitleText returned a non-empty string, so `resolved` here
    // guarantees liveTitleRaw is a real string.
    const liveTitle = liveTitleRaw as string

    if (normalizedLive === normalizedExpected) {
      return { status: 'verified', liveTitle, reason: 'The public page now reflects the fix.' }
    }

    return {
      status: 'mismatch',
      liveTitle,
      reason:
        'WordPress accepted the title update, but the public page is displaying a different title. This can happen if an SEO plugin, theme, or page builder overrides the title.',
    }
  }

  // Only treat this as caching if there was a real previous title being
  // served identically — a page that was missing a title before and is
  // still missing one now isn't "still serving the old value," it simply
  // still has the original problem.
  if (hasMeaningfulPreviousValue && normalizedLive === normalizedPrevious) {
    return {
      status: 'pending',
      liveTitle: liveTitleRaw,
      reason:
        'The WordPress update succeeded, but the public page still appears to be serving the previous title. This may be caused by caching.',
    }
  }

  return {
    status: 'still_detected',
    liveTitle: liveTitleRaw,
    reason: 'The public page does not yet reflect a title that resolves the original issue.',
  }
}
