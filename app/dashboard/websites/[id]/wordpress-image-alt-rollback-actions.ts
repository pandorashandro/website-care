'use server'

import { revalidatePath } from 'next/cache'
import { loadWordPressEditableContent } from '@/lib/integrations/wordpress/editable-content'
import { checkWordPressCapabilities } from '@/lib/integrations/wordpress/capabilities'
import { updateWordPressMediaAltText } from '@/lib/integrations/wordpress/write-image-alt-media'
import { updateWordPressImageAltContent } from '@/lib/integrations/wordpress/write-image-alt-content'
import { detectImageAltSource, findContentImageOccurrences } from '@/lib/fixes/image-alt-source-detection'
import { buildContentWithReplacedImageAlt } from '@/lib/fixes/image-alt-content-transform'
import { verifyPublicImageAlt, type ImageAltFixVerification } from '@/lib/fixes/verify-image-alt-fix'
import { getConnectedWordPressCredentials } from './wordpress-credentials'
import { getFixHistoryRowForRollback, isRollbackEligibleByShape, recordFixHistory } from './fix-history'

export type RollbackImageAltFixState =
  | {
      rollbackWriteStatus: 'success'
      restoredValue: string
      verification: ImageAltFixVerification
      historyStatus: 'saved' | 'failed'
    }
  | { rollbackWriteStatus: 'failed'; reason: string }
  | null

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

const NO_LONGER_SAFE_REASON = 'Website Care could no longer confirm the exact image target, so nothing was undone.'
const CHANGED_SINCE_APPLIED_REASON = 'This image has changed since Website Care applied the fix, so Undo was not performed.'
const ALREADY_REVERTED_REASON = 'This fix is no longer in the applied state, so there is nothing to undo.'

/**
 * Reverses one previous Website Care image-alt fix. The browser may only
 * submit `websiteId` and `fixHistoryId` (an opaque reference to a
 * fix_history row) — exactly like title/meta/H1 rollback, no signed token is
 * involved. historyId is only a lookup key, never sufficient authority on
 * its own: ownership is re-verified via getFixHistoryRowForRollback (scoped
 * to both the row id AND the already-ownership-verified website), and every
 * fact needed to perform the undo is re-derived fresh from the trusted
 * history row plus a live WordPress reload — never from separate
 * browser-submitted pageUrl/imageUrl/mediaId/previousValue/appliedValue
 * fields, which do not exist on this form at all.
 *
 * Unlike Apply, nothing about source/writeStrategy/mediaId is trusted from
 * anything stored: detectImageAltSource is re-run fresh from
 * history.page_url + history.image_url (the one piece of identity that
 * genuinely cannot be re-derived from nothing), and whatever it currently
 * reports is what Undo acts on — exactly the same "never trust stored
 * resource identity, always re-derive" philosophy Apply itself uses.
 *
 * Global drift rule: rollback only proceeds if the CURRENT alt text still
 * exactly equals history.applied_value — the value Website Care itself last
 * wrote. Any drift (a human, plugin, or later edit having changed it since)
 * aborts rather than overwriting newer content. If the current alt already
 * equals history.previous_value, this specific fix has already been
 * reverted (e.g. a previous Undo attempt succeeded, or someone manually
 * restored it) — Undo reports that rather than performing a second,
 * redundant write.
 */
export async function rollbackImageAltFix(
  _prevState: RollbackImageAltFixState,
  formData: FormData
): Promise<RollbackImageAltFixState> {
  const websiteId = formData.get('websiteId') as string | null
  const fixHistoryId = formData.get('fixHistoryId') as string | null

  if (!websiteId || !fixHistoryId) {
    return { rollbackWriteStatus: 'failed', reason: 'Missing information for this request.' }
  }

  // Re-verifies Website Care session + website ownership internally before
  // ever touching fix_history or wordpress_connections.
  const credentials = await getConnectedWordPressCredentials(websiteId)

  if (!credentials.ok) {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'WordPress is not connected (or the connection needs attention) for this website.',
    }
  }

  // Scoped to BOTH the id and the ownership-verified website — a row from a
  // different website (or a different user's website) can never be returned.
  const historyRow = await getFixHistoryRowForRollback(websiteId, fixHistoryId)

  if (!historyRow) {
    return { rollbackWriteStatus: 'failed', reason: 'This fix could not be found.' }
  }

  if (!isRollbackEligibleByShape(historyRow) || historyRow.field !== 'image_alt') {
    return { rollbackWriteStatus: 'failed', reason: 'This change cannot be undone.' }
  }

  // isRollbackEligibleByShape already confirmed these are present/typed for
  // an image_alt row (non-null image_url, a write_strategy that is one of
  // the three valid image-alt values, non-null previous_value, numeric
  // resource_id, resource_type is 'page'|'post').
  const trustedPageUrl = historyRow.page_url
  const trustedImageUrl = historyRow.image_url as string
  const historyWriteStrategy = historyRow.write_strategy as
    | 'media_alt_text'
    | 'gutenberg_content_alt'
    | 'classic_html_alt'
  const historyResourceType = historyRow.resource_type as 'page' | 'post'
  const historyResourceId = historyRow.resource_id as number
  const appliedValue = historyRow.applied_value
  const previousValue = historyRow.previous_value as string

  // Fresh mapping + fresh resource reload from the history row's own
  // page_url — never trusts anything client-submitted, and never reuses a
  // stale resourceId without reconfirming it against a live remap.
  const content = await loadWordPressEditableContent(
    credentials.websiteUrl,
    trustedPageUrl,
    credentials.username,
    credentials.applicationPassword
  )

  if (content.status !== 'loaded') {
    return { rollbackWriteStatus: 'failed', reason: content.reason }
  }

  // The page's current mapping must still point at the exact same resource
  // this history row recorded (protects against the slug being reused by a
  // different page/post since the original fix).
  if (content.resourceType !== historyResourceType || content.resourceId !== historyResourceId) {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'This fix no longer matches the current WordPress resource and cannot be undone safely.',
    }
  }

  // Fresh image-alt source detection — never trusts a stored mediaId (there
  // isn't one). Whatever this reports right now is what Undo acts on, but it
  // is not sufficient by itself: see the write_strategy check immediately
  // below.
  const freshResult = await detectImageAltSource({
    websiteUrl: credentials.websiteUrl,
    imageUrl: trustedImageUrl,
    content,
    username: credentials.username,
    applicationPassword: credentials.applicationPassword,
  })

  if (freshResult.status !== 'supported') {
    return { rollbackWriteStatus: 'failed', reason: NO_LONGER_SAFE_REASON }
  }

  // Exact-strategy proof: fresh detection alone is necessary but not
  // sufficient. WordPress rendering/content structure can legitimately
  // change over time such that a DIFFERENT strategy newly resolves as
  // 'supported' for the same image (e.g. a fix originally applied through
  // media_library could, after a template change, later resolve through
  // gutenberg_content). Undoing through a different strategy than the one
  // Apply actually used would violate exact rollback semantics, so this
  // aborts rather than silently reverting through whatever is convenient
  // right now.
  if (freshResult.writeStrategy !== historyWriteStrategy) {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'Website Care could no longer confirm the same image source used by the original fix, so Undo was not performed.',
    }
  }

  // Global drift rule: only proceed if the current alt text still exactly
  // equals what Website Care itself applied. Distinguish "already reverted"
  // (no-op, safe) from "changed to something else" (abort, unsafe) so a
  // second Undo click — or a page that was already manually restored — never
  // performs a redundant or incorrect write.
  if (freshResult.currentAlt !== appliedValue) {
    if (freshResult.currentAlt === previousValue) {
      return { rollbackWriteStatus: 'failed', reason: ALREADY_REVERTED_REASON }
    }
    return { rollbackWriteStatus: 'failed', reason: CHANGED_SINCE_APPLIED_REASON }
  }

  const capabilityResult = await checkWordPressCapabilities(
    credentials.websiteUrl,
    credentials.username,
    credentials.applicationPassword
  )

  if (!capabilityResult.connectionValid) {
    return { rollbackWriteStatus: 'failed', reason: 'WordPress access has been revoked for this connection.' }
  }

  if (freshResult.writeStrategy === 'media_alt_text') {
    // Same conservative capability model as Apply: upload_files is only a
    // fast-fail negative signal, never sufficient proof of authority on its
    // own. The authoritative check happens inside updateWordPressMediaAltText
    // (a fresh GET .../media/{id}?context=edit on the exact resource).
    if (capabilityResult.capabilities.canUploadMedia === 'unavailable') {
      return {
        rollbackWriteStatus: 'failed',
        reason: 'The connected WordPress account does not have permission to edit media.',
      }
    }

    // Never trusts a stored mediaId — there isn't one. The freshly-derived
    // mediaId from this exact detectImageAltSource call is the only mediaId
    // ever used here.
    if (freshResult.mediaId === null) {
      return { rollbackWriteStatus: 'failed', reason: NO_LONGER_SAFE_REASON }
    }

    const updateResult = await updateWordPressMediaAltText({
      websiteUrl: credentials.websiteUrl,
      mediaId: freshResult.mediaId,
      expectedCurrentAlt: appliedValue,
      proposedValue: previousValue,
      username: credentials.username,
      applicationPassword: credentials.applicationPassword,
    })

    if (updateResult.status !== 'success') {
      return { rollbackWriteStatus: 'failed', reason: updateResult.reason }
    }

    const verification = await verifyPublicImageAlt({
      pageUrl: content.permalink,
      imageUrl: freshResult.imageUrl,
      expectedAlt: previousValue,
    })

    // The original Apply history row is never modified or deleted — this
    // inserts a NEW row representing the rollback as its own historical
    // event, with previous/applied values swapped relative to the original
    // fix, exactly like title/meta/H1 rollback.
    const historyStatus = await recordFixHistory({
      websiteId,
      issueTitle: `Rollback: ${historyRow.issue_title}`,
      pageUrl: trustedPageUrl,
      imageUrl: trustedImageUrl,
      // The strategy actually used for THIS rollback write — by this point
      // proven equal to historyWriteStrategy, but recorded from freshResult
      // (the value actually used), not the historical claim.
      writeStrategy: freshResult.writeStrategy,
      resourceType: content.resourceType,
      resourceId: content.resourceId,
      field: 'image_alt',
      previousValue: appliedValue,
      appliedValue: previousValue,
      verificationStatus: verification.status,
    })

    revalidatePath(`/dashboard/websites/${websiteId}`)

    return { rollbackWriteStatus: 'success', restoredValue: previousValue, verification, historyStatus }
  }

  // gutenberg_content_alt / classic_html_alt
  const requiredCapability =
    content.resourceType === 'page' ? capabilityResult.capabilities.canEditPages : capabilityResult.capabilities.canEditPosts

  if (requiredCapability !== 'available') {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'The connected WordPress account does not have permission to edit this content.',
    }
  }

  // Operates on CURRENT content.raw, not a saved historical blob — only the
  // exact one matching <img> tag's alt attribute is replaced; everything
  // else (including any paragraph edits made after the original Apply) is
  // preserved byte-for-byte. Aborts if the exact target cannot be uniquely
  // located.
  const transform = buildContentWithReplacedImageAlt({
    rawContent: content.content as string,
    normalizedImageUrl: freshResult.imageUrl,
    mediaId: freshResult.mediaId,
    resolutionBase: content.permalink,
    proposedAlt: previousValue,
  })

  if (transform.status !== 'ready') {
    return { rollbackWriteStatus: 'failed', reason: transform.reason }
  }

  const restBase = content.resourceType === 'page' ? 'pages' : 'posts'

  const updateResult = await updateWordPressImageAltContent({
    websiteUrl: credentials.websiteUrl,
    restBase,
    resourceId: content.resourceId,
    expectedPermalink: content.permalink,
    updatedContent: transform.updatedContent,
    username: credentials.username,
    applicationPassword: credentials.applicationPassword,
  })

  if (updateResult.status !== 'success') {
    return { rollbackWriteStatus: 'failed', reason: updateResult.reason }
  }

  // Response validation: confirm the returned content.raw actually shows
  // the restored (previous) alt text at exactly the one occurrence targeted.
  const returnedOccurrences = findContentImageOccurrences(
    updateResult.contentRaw,
    freshResult.imageUrl,
    freshResult.mediaId,
    updateResult.permalink
  )

  const confirmedInResponse =
    returnedOccurrences.length === 1 &&
    returnedOccurrences[0].hasAltAttribute &&
    normalizeForComparison(returnedOccurrences[0].altValue ?? '') === normalizeForComparison(previousValue)

  if (!confirmedInResponse) {
    return {
      rollbackWriteStatus: 'failed',
      reason: "WordPress's response did not confirm the alt text was restored.",
    }
  }

  const verification = await verifyPublicImageAlt({
    pageUrl: content.permalink,
    imageUrl: freshResult.imageUrl,
    expectedAlt: previousValue,
  })

  const historyStatus = await recordFixHistory({
    websiteId,
    issueTitle: `Rollback: ${historyRow.issue_title}`,
    pageUrl: trustedPageUrl,
    imageUrl: trustedImageUrl,
    writeStrategy: freshResult.writeStrategy,
    resourceType: content.resourceType,
    resourceId: content.resourceId,
    field: 'image_alt',
    previousValue: appliedValue,
    appliedValue: previousValue,
    verificationStatus: verification.status,
  })

  revalidatePath(`/dashboard/websites/${websiteId}`)

  return { rollbackWriteStatus: 'success', restoredValue: previousValue, verification, historyStatus }
}
