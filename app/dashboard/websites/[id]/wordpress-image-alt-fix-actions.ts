'use server'

import { revalidatePath } from 'next/cache'
import {
  wordpressResources,
  wordpressCapabilities,
  wordpressImageAltSource,
  wordpressWriters,
} from '@/lib/integrations/wordpress/adapter'
import { buildContentWithReplacedImageAlt } from '@/lib/fixes/image-alt-content-transform'
import { verifyImageAltPreviewToken, hashContent } from '@/lib/fixes/preview-token'
import { validateAiAltText } from '@/lib/ai/image-alt-recommendation'
import { verifyPublicImageAlt, type ImageAltFixVerification } from '@/lib/fixes/verify-image-alt-fix'
import { getConnectedWordPressCredentials } from './wordpress-credentials'
import { getTrustedMissingImageAltIssue } from './image-alt-issue'
import { recordFixHistory } from './fix-history'

export type ApplyImageAltFixState =
  | {
      writeStatus: 'success'
      imageUrl: string
      previousValue: string
      appliedValue: string
      source: 'media_library' | 'gutenberg_content' | 'classic_html'
      writeStrategy: 'media_alt_text' | 'gutenberg_content_alt' | 'classic_html_alt'
      verification: ImageAltFixVerification
      historyStatus: 'saved' | 'failed'
    }
  | { writeStatus: 'failed'; reason: string }
  | null

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

const STALE_PREVIEW_REASON = 'This fix preview is no longer valid. Please prepare the fix again.'
const CHANGED_SINCE_PREVIEW_REASON = 'This image changed since the preview was created. Please prepare a new fix before applying.'
const NO_LONGER_SAFE_REASON = 'webioom could no longer confirm the exact image target, so nothing was changed.'

/**
 * Applies a previously-previewed missing-image-alt fix to WordPress. This is
 * the ONLY image-alt write path in the codebase, and it never calls AI — the
 * approved text was already generated and validated once at Prepare time;
 * here it is only re-validated deterministically (validateAiAltText),
 * exactly like applyH1Fix reuses validateAiH1.
 *
 * The browser submits ONLY the opaque previewToken. Nothing about the write
 * target is trusted from the token alone: the trusted issue row is
 * re-fetched and its full ownership chain (issue -> scan -> website -> user)
 * is re-walked via getTrustedMissingImageAltIssue, the token's claimed
 * pageUrl/imageUrl must exactly match what that fresh DB lookup returns, the
 * WordPress resource is freshly re-mapped/reloaded, image-alt source
 * detection is re-run fresh (source, writeStrategy, and mediaId must all
 * still match what was previewed), and the current alt text / content
 * fingerprint must still match what Prepare Fix captured. Any drift aborts
 * rather than risk writing something the user never actually saw confirmed
 * or overwriting somebody else's more recent change.
 */
export async function applyImageAltFix(
  _prevState: ApplyImageAltFixState,
  formData: FormData
): Promise<ApplyImageAltFixState> {
  const previewToken = formData.get('previewToken') as string | null

  if (!previewToken) {
    return { writeStatus: 'failed', reason: 'Missing information for this request.' }
  }

  const verified = verifyImageAltPreviewToken(previewToken)

  if (!verified.ok) {
    return {
      writeStatus: 'failed',
      reason:
        verified.reason === 'expired'
          ? 'This fix preview has expired. Please prepare the fix again.'
          : 'This fix preview could not be verified. Please prepare the fix again.',
    }
  }

  const {
    issueId,
    websiteId,
    pageUrl,
    issueTitle,
    imageUrl,
    source: expectedSource,
    writeStrategy: expectedWriteStrategy,
    mediaId: expectedMediaId,
    expectedCurrentAlt,
    expectedContentHash,
    proposedValue,
  } = verified.payload

  // Proposal integrity: re-run deterministic validation on the approved
  // value before ever writing it. Never re-generated (no AI call) — AI must
  // never run during Apply.
  const revalidatedAlt = validateAiAltText(proposedValue)
  if (!revalidatedAlt) {
    return { writeStatus: 'failed', reason: STALE_PREVIEW_REASON }
  }

  // Re-authenticates the session and re-walks the full ownership chain
  // (issue -> scan -> website -> user) itself — never trusts the token's
  // issueId/websiteId as proof the current session may act on this issue.
  const trustedIssue = await getTrustedMissingImageAltIssue(websiteId, issueId)

  if (!trustedIssue.ok) {
    return { writeStatus: 'failed', reason: trustedIssue.reason }
  }

  // The token's claimed identity must match what the trusted DB row itself
  // says right now — the token alone is never treated as authority.
  if (trustedIssue.issue.pageUrl !== pageUrl || trustedIssue.issue.imageUrl !== imageUrl) {
    return { writeStatus: 'failed', reason: CHANGED_SINCE_PREVIEW_REASON }
  }

  const credentials = await getConnectedWordPressCredentials(websiteId)

  if (!credentials.ok) {
    return {
      writeStatus: 'failed',
      reason: 'WordPress is not connected (or the connection needs attention) for this website.',
    }
  }

  // Fresh mapping + fresh resource reload — never reuses anything from the
  // earlier Prepare Fix call.
  const content = await wordpressResources.loadEditable(
    credentials.websiteUrl,
    trustedIssue.issue.pageUrl,
    credentials.username,
    credentials.applicationPassword
  )

  if (content.status !== 'loaded') {
    return { writeStatus: 'failed', reason: content.reason }
  }

  // Fresh image-alt source detection — never trusts Prepare-time detection
  // as authority. Must still be supported, with the exact same source,
  // write strategy, and media mapping the preview was based on.
  const freshResult = await wordpressImageAltSource.detect({
    websiteUrl: credentials.websiteUrl,
    imageUrl: trustedIssue.issue.imageUrl,
    content,
    username: credentials.username,
    applicationPassword: credentials.applicationPassword,
  })

  if (freshResult.status !== 'supported') {
    return { writeStatus: 'failed', reason: NO_LONGER_SAFE_REASON }
  }

  if (freshResult.source !== expectedSource || freshResult.writeStrategy !== expectedWriteStrategy) {
    return {
      writeStatus: 'failed',
      reason: 'This image’s editable source changed since the preview was prepared. Please prepare the fix again.',
    }
  }

  if (freshResult.mediaId !== expectedMediaId) {
    return { writeStatus: 'failed', reason: CHANGED_SINCE_PREVIEW_REASON }
  }

  if (freshResult.currentAlt !== expectedCurrentAlt) {
    return {
      writeStatus: 'failed',
      reason: 'This image’s alt text changed since the preview was prepared. Please prepare a new fix before applying.',
    }
  }

  // Content-hash stale protection only applies to content-level strategies —
  // the media_library write targets the attachment resource directly, so
  // the page body changing elsewhere is not a reason to block it.
  if (expectedWriteStrategy !== 'media_alt_text') {
    const currentContentHash = hashContent(content.content ?? '')
    if (currentContentHash !== expectedContentHash) {
      return {
        writeStatus: 'failed',
        reason: 'The WordPress page content changed since this preview was prepared. Please prepare the fix again.',
      }
    }
  }

  const capabilityResult = await wordpressCapabilities.check(
    credentials.websiteUrl,
    credentials.username,
    credentials.applicationPassword
  )

  if (!capabilityResult.connectionValid) {
    return { writeStatus: 'failed', reason: 'WordPress access has been revoked for this connection.' }
  }

  if (expectedWriteStrategy === 'media_alt_text') {
    // upload_files is only a fast-fail negative signal here — it does not
    // by itself prove authority to edit an arbitrary existing attachment.
    // The authoritative check happens inside updateWordPressMediaAltText
    // (a fresh GET .../media/{id}?context=edit on the exact resource).
    if (capabilityResult.capabilities.canUploadMedia === 'unavailable') {
      return {
        writeStatus: 'failed',
        reason: 'The connected WordPress account does not have permission to edit media.',
      }
    }

    if (freshResult.mediaId === null) {
      return { writeStatus: 'failed', reason: NO_LONGER_SAFE_REASON }
    }

    const updateResult = await wordpressWriters.imageAltMedia({
      websiteUrl: credentials.websiteUrl,
      mediaId: freshResult.mediaId,
      expectedCurrentAlt,
      proposedValue: revalidatedAlt,
      username: credentials.username,
      applicationPassword: credentials.applicationPassword,
    })

    if (updateResult.status !== 'success') {
      return { writeStatus: 'failed', reason: updateResult.reason }
    }

    // Exactly one targeted public verification attempt — no retries, no
    // polling. Media-library alt_text may or may not control what the
    // theme/template renders publicly, so 'unavailable' here is expected and
    // common — it never implies the WordPress write itself failed.
    const verification = await verifyPublicImageAlt({
      pageUrl: content.permalink,
      imageUrl: freshResult.imageUrl,
      expectedAlt: updateResult.altText,
    })

    // Recorded regardless of verification outcome — a successful,
    // authenticated WordPress write is a real change and must be auditable
    // even when public verification is unavailable or inconclusive.
    const historyStatus = await recordFixHistory({
      websiteId,
      issueTitle,
      pageUrl: trustedIssue.issue.pageUrl,
      imageUrl: trustedIssue.issue.imageUrl,
      writeStrategy: freshResult.writeStrategy,
      resourceType: content.resourceType,
      resourceId: content.resourceId,
      field: 'image_alt',
      previousValue: expectedCurrentAlt,
      appliedValue: updateResult.altText,
      verificationStatus: verification.status,
    })

    revalidatePath(`/dashboard/websites/${websiteId}`)

    return {
      writeStatus: 'success',
      imageUrl: trustedIssue.issue.imageUrl,
      previousValue: expectedCurrentAlt,
      appliedValue: updateResult.altText,
      source: freshResult.source,
      writeStrategy: 'media_alt_text',
      verification,
      historyStatus,
    }
  }

  // gutenberg_content_alt / classic_html_alt
  const requiredCapability =
    content.resourceType === 'page' ? capabilityResult.capabilities.canEditPages : capabilityResult.capabilities.canEditPosts

  if (requiredCapability !== 'available') {
    return {
      writeStatus: 'failed',
      reason: 'The connected WordPress account does not have permission to edit this content.',
    }
  }

  const transform = buildContentWithReplacedImageAlt({
    rawContent: content.content as string,
    normalizedImageUrl: freshResult.imageUrl,
    mediaId: freshResult.mediaId,
    resolutionBase: content.permalink,
    proposedAlt: revalidatedAlt,
  })

  if (transform.status !== 'ready') {
    return { writeStatus: 'failed', reason: transform.reason }
  }

  const restBase = content.resourceType === 'page' ? 'pages' : 'posts'

  const updateResult = await wordpressWriters.imageAltContent({
    websiteUrl: credentials.websiteUrl,
    restBase,
    resourceId: content.resourceId,
    expectedPermalink: content.permalink,
    updatedContent: transform.updatedContent,
    username: credentials.username,
    applicationPassword: credentials.applicationPassword,
  })

  if (updateResult.status !== 'success') {
    return { writeStatus: 'failed', reason: updateResult.reason }
  }

  // Response validation: confirm the returned content.raw actually shows
  // the new alt text at exactly the one occurrence we targeted. Full-content
  // byte equality isn't required (WordPress's save pipeline may legitimately
  // reformat markup) — see write-image-alt-content.ts for the reasoning.
  const returnedOccurrences = wordpressImageAltSource.findContentOccurrences(
    updateResult.contentRaw,
    freshResult.imageUrl,
    freshResult.mediaId,
    updateResult.permalink
  )

  const confirmedInResponse =
    returnedOccurrences.length === 1 &&
    returnedOccurrences[0].hasAltAttribute &&
    normalizeForComparison(returnedOccurrences[0].altValue ?? '') === normalizeForComparison(revalidatedAlt)

  if (!confirmedInResponse) {
    return {
      writeStatus: 'failed',
      reason: "WordPress's response did not confirm the alt text was updated.",
    }
  }

  // Exactly one targeted public verification attempt — no retries, no
  // polling, and never a reason to retry the write or roll it back.
  const verification = await verifyPublicImageAlt({
    pageUrl: content.permalink,
    imageUrl: freshResult.imageUrl,
    expectedAlt: revalidatedAlt,
  })

  // Recorded regardless of verification outcome — see the media-library
  // branch above for the same reasoning.
  const historyStatus = await recordFixHistory({
    websiteId,
    issueTitle,
    pageUrl: trustedIssue.issue.pageUrl,
    imageUrl: trustedIssue.issue.imageUrl,
    // freshResult.writeStrategy, not the token's expectedWriteStrategy — by
    // this point they are proven equal (checked above), but the value
    // recorded must always be the one the fresh, actually-used detection
    // result reported, never the token's claim.
    writeStrategy: freshResult.writeStrategy,
    resourceType: content.resourceType,
    resourceId: content.resourceId,
    field: 'image_alt',
    previousValue: expectedCurrentAlt,
    appliedValue: revalidatedAlt,
    verificationStatus: verification.status,
  })

  revalidatePath(`/dashboard/websites/${websiteId}`)

  return {
    writeStatus: 'success',
    imageUrl: trustedIssue.issue.imageUrl,
    previousValue: expectedCurrentAlt,
    appliedValue: revalidatedAlt,
    source: freshResult.source,
    writeStrategy: expectedWriteStrategy,
    verification,
    historyStatus,
  }
}
