import 'server-only'
import { fetchPage, getTitleText } from '@/lib/scanner/checks'

export type RollbackVerification =
  | { status: 'verified'; liveTitle: string; reason: string }
  | { status: 'pending'; liveTitle: string | null; reason: string }
  | { status: 'mismatch'; liveTitle: string | null; reason: string }
  | { status: 'unavailable'; reason: string }

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Targeted, read-only, single-attempt verification of one just-applied
 * WordPress ROLLBACK. Unlike verifyTitleFix, there is no "original issue" to
 * resolve here — the only question is whether the public page now reflects
 * the restored value. Fetches the PUBLIC page (never the authenticated
 * WordPress REST API) via the scanner's own fetchPage, so no credential of
 * any kind is ever attached to this request.
 */
export async function verifyRollback(input: {
  pageUrl: string
  restoredValue: string
  valueBeforeRollback: string
}): Promise<RollbackVerification> {
  const { pageUrl, restoredValue, valueBeforeRollback } = input

  const fetched = await fetchPage(pageUrl)

  if (!fetched.ok) {
    return { status: 'unavailable', reason: 'The public page could not be checked right now.' }
  }

  if (fetched.finalStatus < 200 || fetched.finalStatus >= 300) {
    return { status: 'unavailable', reason: 'The public page did not return a normal response when checked.' }
  }

  const liveTitleRaw = getTitleText(fetched.html)
  const normalizedLive = liveTitleRaw !== null ? normalizeForComparison(liveTitleRaw) : ''
  const normalizedRestored = normalizeForComparison(restoredValue)
  const normalizedBefore = normalizeForComparison(valueBeforeRollback)

  if (normalizedLive === normalizedRestored) {
    return {
      status: 'verified',
      liveTitle: liveTitleRaw ?? '',
      reason: 'The public page now reflects the restored title.',
    }
  }

  // Only treat this as caching if the live page is still serving the exact
  // value that was live immediately before the rollback write.
  if (normalizedBefore.length > 0 && normalizedLive === normalizedBefore) {
    return {
      status: 'pending',
      liveTitle: liveTitleRaw,
      reason:
        'The rollback succeeded, but the public page still appears to be serving the previous title. This may be caused by caching.',
    }
  }

  return {
    status: 'mismatch',
    liveTitle: liveTitleRaw,
    reason:
      'WordPress accepted the rollback, but the public page is displaying a different title than expected.',
  }
}
