import 'server-only'
import { fetchPage } from '@/lib/scanner/checks'
import { normalizeUrl } from '@/lib/scanner/url-utils'
import { findContentImageOccurrences } from './image-alt-source-detection'

export type ImageAltFixVerification =
  | { status: 'verified'; liveAlt: string; reason: string }
  | { status: 'mismatch'; liveAlt: string; reason: string }
  | { status: 'unavailable'; reason: string }

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Targeted, read-only, single-attempt public verification of one image's alt
 * text — shared by both the image-alt Apply flow (expectedAlt = the value
 * just applied) and the image-alt Undo flow (expectedAlt = the value just
 * restored). Unlike title/meta/H1, image-alt verification reduces to the
 * exact same question in both directions ("does the public page now show
 * this exact alt text for this exact image"), so one function safely serves
 * both rather than duplicating the same check into two near-identical files.
 *
 * Fetches the PUBLIC page only (via the scanner's own fetchPage — the same
 * SSRF guard, redirect re-validation, timeout, and HTTPS handling as a
 * normal scan) and NEVER attaches any WordPress credential or Authorization
 * header; the authenticated WordPress REST response is never treated as
 * public verification.
 *
 * Identity is intentionally the narrowest possible rule: an exact normalized
 * <img src> match only (mediaId is never passed to
 * findContentImageOccurrences here) — matching by a wp-image-{id} class
 * alone would be "media-ID-only public matching," which is unsafe because
 * the rendered public markup is what the theme/template chooses to emit, not
 * something WordPress's attachment metadata controls directly. Zero or more
 * than one matching occurrence, an unreadable page, or a non-2xx response
 * all resolve to 'unavailable' rather than a guess — this deliberately means
 * a media-library alt-text change (which many themes render from a
 * differently-sized derivative URL, or not as the <img> element's src at
 * all) will often come back 'unavailable' rather than falsely 'verified' or
 * 'mismatch', per the conservative media-library verification rule.
 */
export async function verifyPublicImageAlt(input: {
  pageUrl: string
  imageUrl: string
  expectedAlt: string
}): Promise<ImageAltFixVerification> {
  const { pageUrl, imageUrl, expectedAlt } = input

  const normalizedImageUrl = normalizeUrl(imageUrl, pageUrl)
  if (!normalizedImageUrl) {
    return { status: 'unavailable', reason: 'The image address could not be checked.' }
  }

  const fetched = await fetchPage(pageUrl)

  if (!fetched.ok) {
    return { status: 'unavailable', reason: 'The public page could not be checked right now.' }
  }

  if (fetched.finalStatus < 200 || fetched.finalStatus >= 300) {
    return { status: 'unavailable', reason: 'The public page did not return a normal response when checked.' }
  }

  const occurrences = findContentImageOccurrences(fetched.html, normalizedImageUrl, null, pageUrl)

  if (occurrences.length === 0) {
    return {
      status: 'unavailable',
      reason: 'webioom could not find this exact image on the public page to verify it.',
    }
  }

  if (occurrences.length > 1) {
    return {
      status: 'unavailable',
      reason: 'webioom found more than one matching image on the public page and cannot verify a single target.',
    }
  }

  const occurrence = occurrences[0]

  if (!occurrence.hasAltAttribute) {
    return {
      status: 'unavailable',
      reason: 'webioom found the image but could not read its public alt attribute.',
    }
  }

  const liveAlt = occurrence.altValue ?? ''

  if (normalizeForComparison(liveAlt) === normalizeForComparison(expectedAlt)) {
    return { status: 'verified', liveAlt, reason: 'The public page now reflects the fix.' }
  }

  return {
    status: 'mismatch',
    liveAlt,
    reason: 'WordPress accepted the update, but the public page is displaying different alt text for this image.',
  }
}
