import 'server-only'
import { fetchPage, getH1Texts } from '@/lib/scanner/checks'

export type H1RollbackVerification =
  | { status: 'verified'; reason: string }
  | { status: 'pending'; livePublicH1: string; reason: string }
  | { status: 'mismatch'; livePublicH1: string; reason: string }
  | { status: 'unavailable'; reason: string }

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Targeted, read-only, single-attempt verification of one just-applied H1
 * ROLLBACK. Unlike verify-h1-fix.ts, the question here is whether the
 * removed heading is gone — 'verified' means the public page no longer
 * shows it (typically back to zero H1s, i.e. the original missing_h1 state
 * is restored). No credential of any kind is ever attached to this request.
 */
export async function verifyH1Rollback(input: { pageUrl: string; removedH1: string }): Promise<H1RollbackVerification> {
  const { pageUrl, removedH1 } = input

  const fetched = await fetchPage(pageUrl)

  if (!fetched.ok) {
    return { status: 'unavailable', reason: 'The public page could not be checked right now.' }
  }

  if (fetched.finalStatus < 200 || fetched.finalStatus >= 300) {
    return { status: 'unavailable', reason: 'The public page did not return a normal response when checked.' }
  }

  const publicH1s = getH1Texts(fetched.html)
  const normalizedRemoved = normalizeForComparison(removedH1)

  if (publicH1s.length === 0) {
    return { status: 'verified', reason: 'The public page no longer shows the removed heading.' }
  }

  const stillPresent = publicH1s.find((h1) => normalizeForComparison(h1) === normalizedRemoved)

  if (stillPresent) {
    return {
      status: 'pending',
      livePublicH1: stillPresent,
      reason:
        'The rollback succeeded, but the public page still appears to show the previous heading. This may be caused by caching.',
    }
  }

  return {
    status: 'mismatch',
    livePublicH1: publicH1s[0],
    reason: 'WordPress accepted the rollback, but the public page is showing a different heading than expected.',
  }
}
