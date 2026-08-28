/**
 * Pure alt-attribute replacement. No fetch, no Supabase, no credentials, no
 * React — safe to unit test directly. Reuses findContentImageOccurrences
 * from image-alt-source-detection.ts so Apply's occurrence-matching is
 * byte-identical to whatever Prepare's detection already proved was safe —
 * never a second, independently-written identity rule (per the "exact
 * normalized URL plus the deterministic source detection rules" convention).
 *
 * Only ever replaces an EXISTING alt attribute's value. Never inserts a new
 * alt attribute: detectImageAltSource never reports 'supported' for a
 * content-level occurrence that lacks one, so a missing attribute here is
 * unreachable in normal operation — still checked defensively rather than
 * assumed, and treated as an abort rather than silently doing something the
 * preview never showed.
 */

import { findContentImageOccurrences } from './image-alt-source-detection'

export type ImageAltContentTransformResult =
  | { status: 'ready'; updatedContent: string }
  | { status: 'unsafe'; reason: string }

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const DUPLICATE_REASON =
  'Website Care found more than one matching image in this page and will not guess which one to change.'

/**
 * Replaces only the alt attribute value of the single <img> tag matching
 * normalizedImageUrl (or mediaId's wp-image-{id} class) in rawContent.
 * Aborts rather than guessing if: zero or more than one occurrence exists,
 * the occurrence has no alt attribute, or the exact matched tag substring is
 * not unique within rawContent (defense against a byte-identical tag
 * appearing more than once, which indexOf/replace could otherwise target
 * ambiguously). Everything else in rawContent is preserved byte-for-byte —
 * no reparsing, no reformatting, no reserialization.
 */
export function buildContentWithReplacedImageAlt(params: {
  rawContent: string
  normalizedImageUrl: string
  mediaId: number | null
  resolutionBase: string
  proposedAlt: string
}): ImageAltContentTransformResult {
  const occurrences = findContentImageOccurrences(
    params.rawContent,
    params.normalizedImageUrl,
    params.mediaId,
    params.resolutionBase
  )

  if (occurrences.length === 0) {
    return { status: 'unsafe', reason: 'This image could no longer be found in the page content.' }
  }

  if (occurrences.length > 1) {
    return { status: 'unsafe', reason: DUPLICATE_REASON }
  }

  const occurrence = occurrences[0]

  if (!occurrence.hasAltAttribute) {
    return { status: 'unsafe', reason: 'This image no longer has an editable alt attribute.' }
  }

  const matchedTag = occurrence.matchedTag
  const tagOccurrenceCount = params.rawContent.split(matchedTag).length - 1

  if (tagOccurrenceCount !== 1) {
    return { status: 'unsafe', reason: DUPLICATE_REASON }
  }

  const altAttributePattern = /\balt\s*=\s*("([^"]*)"|'([^']*)')/i

  if (!altAttributePattern.test(matchedTag)) {
    return { status: 'unsafe', reason: 'Website Care could not safely update this image’s alt text.' }
  }

  const escapedAlt = escapeHtml(params.proposedAlt)
  const updatedTag = matchedTag.replace(altAttributePattern, `alt="${escapedAlt}"`)

  const index = params.rawContent.indexOf(matchedTag)
  const updatedContent = params.rawContent.slice(0, index) + updatedTag + params.rawContent.slice(index + matchedTag.length)

  return { status: 'ready', updatedContent }
}
