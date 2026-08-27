import 'server-only'
import { fetchPage, getMetaDescriptionContent } from '@/lib/scanner/checks'

export type MetaDescriptionRollbackVerification =
  | { status: 'verified'; liveValue: string; reason: string }
  | { status: 'pending'; liveValue: string | null; reason: string }
  | { status: 'mismatch'; liveValue: string | null; reason: string }
  | { status: 'unavailable'; reason: string }

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Targeted, read-only, single-attempt verification of one just-applied
 * meta-description ROLLBACK. Mirrors verify-rollback.ts (titles) — there is
 * no "original issue" to resolve here, only whether the public page now
 * reflects the restored value. Fetches the PUBLIC page only; no credential
 * of any kind is ever attached to this request.
 */
export async function verifyMetaDescriptionRollback(input: {
  pageUrl: string
  restoredValue: string
  valueBeforeRollback: string
}): Promise<MetaDescriptionRollbackVerification> {
  const { pageUrl, restoredValue, valueBeforeRollback } = input

  const fetched = await fetchPage(pageUrl)

  if (!fetched.ok) {
    return { status: 'unavailable', reason: 'The public page could not be checked right now.' }
  }

  if (fetched.finalStatus < 200 || fetched.finalStatus >= 300) {
    return { status: 'unavailable', reason: 'The public page did not return a normal response when checked.' }
  }

  const liveValueRaw = getMetaDescriptionContent(fetched.html)
  const normalizedLive = liveValueRaw !== null ? normalizeForComparison(liveValueRaw) : ''
  const normalizedRestored = normalizeForComparison(restoredValue)
  const normalizedBefore = normalizeForComparison(valueBeforeRollback)

  if (normalizedLive === normalizedRestored) {
    return {
      status: 'verified',
      liveValue: liveValueRaw ?? '',
      reason: 'The public page now reflects the restored meta description.',
    }
  }

  if (normalizedBefore.length > 0 && normalizedLive === normalizedBefore) {
    return {
      status: 'pending',
      liveValue: liveValueRaw,
      reason:
        'The rollback succeeded, but the public page still appears to be serving the previous meta description. This may be caused by caching.',
    }
  }

  return {
    status: 'mismatch',
    liveValue: liveValueRaw,
    reason:
      'WordPress accepted the rollback, but the public page is displaying a different meta description than expected.',
  }
}
