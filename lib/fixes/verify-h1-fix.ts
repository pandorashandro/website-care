import 'server-only'
import { fetchPage, getH1Texts } from '@/lib/scanner/checks'

export type H1FixVerification =
  | { status: 'verified'; livePublicH1: string; reason: string }
  | { status: 'pending'; livePublicH1: null; reason: string }
  | { status: 'mismatch'; livePublicH1: string; reason: string }
  | { status: 'unavailable'; reason: string }

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Targeted, read-only, single-attempt verification of one just-applied
 * missing-H1 fix. Fetches the PUBLIC page (never the authenticated
 * WordPress REST API) via the scanner's own fetchPage, and extracts H1 text
 * via the scanner's own getH1Texts — no credential of any kind attached.
 *
 * Result model: missing_h1 is the only writable H1 issue, so there is no
 * "still_detected" state distinct from 'pending' the way title/meta
 * verification has one — a public H1 count still at zero IS the exact
 * pre-fix state, so it is reported as 'pending' (consistent with caching)
 * rather than a separately-labeled failure.
 */
export async function verifyH1Fix(input: { pageUrl: string; expectedH1: string }): Promise<H1FixVerification> {
  const { pageUrl, expectedH1 } = input

  const fetched = await fetchPage(pageUrl)

  if (!fetched.ok) {
    return { status: 'unavailable', reason: 'The public page could not be checked right now.' }
  }

  if (fetched.finalStatus < 200 || fetched.finalStatus >= 300) {
    return { status: 'unavailable', reason: 'The public page did not return a normal response when checked.' }
  }

  const publicH1s = getH1Texts(fetched.html)

  if (publicH1s.length === 0) {
    return {
      status: 'pending',
      livePublicH1: null,
      reason:
        'The WordPress update succeeded, but the public page does not show a heading yet. This may be caused by caching.',
    }
  }

  const normalizedExpected = normalizeForComparison(expectedH1)
  const match = publicH1s.find((h1) => normalizeForComparison(h1) === normalizedExpected)

  if (match) {
    return { status: 'verified', livePublicH1: match, reason: 'The public page now shows the added heading.' }
  }

  return {
    status: 'mismatch',
    livePublicH1: publicH1s[0],
    reason: 'WordPress accepted the update, but the public page is not showing the expected heading text.',
  }
}
