'use server'

import { revalidatePath } from 'next/cache'
import { getValidWixAccessToken } from './wix-credentials'
import { resolveWixResource, mappingFailureMessage, type WixResourceFamily } from '@/lib/integrations/wix/resource-mapping'
import { getWixSiteIdentity } from '@/lib/integrations/wix/site-identity'
import { evaluateWixFixCapability, capabilityFailureMessage } from '@/lib/integrations/wix/capabilities'
import { readWixItemSeoTags, extractResolvedTitle, mutationFailureMessage } from '@/lib/integrations/wix/seo-tags'
import { executeWixTitleMutation } from './wix-title-fix-actions'
import { WIX_PLATFORM } from '@/lib/integrations/wix/platform'
import { getFixHistoryRowForRollback, isWixRollbackEligibleByShape, recordFixHistory, type FixHistoryInsertResult } from './fix-history'
import { getTitleText } from '@/lib/scanner/checks'
import { verifyWixPublicValue, type WixPublicVerification } from '@/lib/fixes/verify-wix-public-value'

export type RollbackWixTitleFixState =
  | {
      rollbackWriteStatus: 'success'
      resourceType: WixResourceFamily
      itemId: string
      restoredTitle: string
      /**
       * Public-site verification of the ROLLBACK, independent of
       * `rollbackWriteStatus` (which stays 'success' regardless of what
       * this says — see verifyWixPublicValue's own doc comment). Expected
       * value = the restored (previous) title; "value before this write" =
       * the title being undone (historyRow.applied_value).
       */
      verification: WixPublicVerification
      historyStatus: FixHistoryInsertResult
    }
  | { rollbackWriteStatus: 'failed'; reason: string }
  | null

function itemTypeToWixSeoItemType(resourceType: WixResourceFamily): 'BLOG_POST' | 'STORES_PRODUCT' {
  return resourceType === 'blog_post' ? 'BLOG_POST' : 'STORES_PRODUCT'
}

/**
 * Wix V1 Prompt 3 — reverses one previous webioom Wix Title fix (Blog Post
 * or Stores Product). Mirrors shopify-title-rollback-actions.ts's
 * rechecking sequence exactly (fresh ownership/token, fresh resource
 * re-resolution, identity confirmation, fresh capability, exact-value drift
 * check), adapted to Wix's item-GUID identity and its own SEO Tags API. No
 * preview token is involved — the browser may only submit `websiteId` and
 * `fixHistoryId` (an opaque reference to a fix_history row); the restore
 * value, item id/type, and page URL are all re-derived server-side from the
 * trusted history row and a fresh Wix re-resolution.
 *
 * CORE SAFETY RULE: rollback only ever proceeds if the CURRENT Wix title
 * still exactly equals the value webioom itself last applied — any drift
 * (a merchant, another app, or Wix itself changing it since) aborts rather
 * than overwriting newer content.
 *
 * After an accepted write, performs exactly one read-only public-site check
 * (verifyWixPublicValue, shared with Apply and with Meta Description Undo)
 * and records its REAL verified/pending/mismatch/unavailable outcome to
 * fix_history — never a placeholder implying the Admin response alone
 * proved public rendering. The verification result never feeds back into
 * another mutation.
 */
export async function rollbackWixTitleFix(_prevState: RollbackWixTitleFixState, formData: FormData): Promise<RollbackWixTitleFixState> {
  const websiteId = formData.get('websiteId') as string | null
  const fixHistoryId = formData.get('fixHistoryId') as string | null

  if (!websiteId || !fixHistoryId) {
    return { rollbackWriteStatus: 'failed', reason: 'Missing information for this request.' }
  }

  const tokenResult = await getValidWixAccessToken(websiteId)
  if (!tokenResult.ok) {
    return { rollbackWriteStatus: 'failed', reason: 'Wix is not connected (or the connection needs attention) for this website.' }
  }
  const { accessToken } = tokenResult

  // Scoped to BOTH the id and the ownership-verified website — a row from a
  // different website (or a manipulated id) can never be returned here.
  const historyRow = await getFixHistoryRowForRollback(websiteId, fixHistoryId)

  if (!historyRow) {
    return { rollbackWriteStatus: 'failed', reason: 'This fix could not be found.' }
  }

  // Shape + fix-family gate: rejects any row that is not a Wix Title row
  // belonging to this exact website — including a Wix Meta Description row,
  // a WordPress/Shopify row of any kind, or a malformed row.
  if (!isWixRollbackEligibleByShape(historyRow) || historyRow.field !== 'title') {
    return { rollbackWriteStatus: 'failed', reason: 'This change cannot be undone.' }
  }

  const historyItemId = historyRow.resource_gid as string
  const historyResourceType = historyRow.resource_type as WixResourceFamily
  const restoreValue = historyRow.previous_value as string

  // Fresh resource re-resolution from the history row's own page_url — never
  // trusts the stored resourceType/itemId alone, and never reuses anything
  // from the original Apply.
  const mapping = await resolveWixResource(accessToken, historyRow.page_url)
  if (!mapping.ok) {
    return { rollbackWriteStatus: 'failed', reason: mappingFailureMessage(mapping) }
  }

  // Identity confirmation: the freshly-resolved resource must be the EXACT
  // same resource this history row recorded — never a different resource
  // that now happens to occupy the same URL.
  if (mapping.resourceType !== historyResourceType || mapping.itemId !== historyItemId) {
    return { rollbackWriteStatus: 'failed', reason: 'This fix no longer matches the current Wix resource and cannot be undone safely.' }
  }

  const itemType = itemTypeToWixSeoItemType(mapping.resourceType)

  // Fresh read — authoritative for both the drift check AND the tags array
  // this write must preserve unrelated entries from.
  const readResult = await readWixItemSeoTags(accessToken, itemType, mapping.itemId)
  if (!readResult.ok) {
    return { rollbackWriteStatus: 'failed', reason: 'webioom could not confirm the current title before undoing this update.' }
  }

  const siteIdentity = await getWixSiteIdentity(accessToken)
  const isPrimaryLanguage =
    siteIdentity.ok && (readResult.language === null || readResult.language === siteIdentity.primaryLanguageCode)

  // Capability re-evaluated fresh — a permission/language change since the
  // original fix (or since a prior failed Undo attempt) is caught here,
  // never assumed still granted.
  const capability = evaluateWixFixCapability('title', { resourceType: mapping.resourceType, isPrimaryLanguage })
  if (capability.status !== 'supported') {
    return { rollbackWriteStatus: 'failed', reason: capabilityFailureMessage(capability) }
  }

  // Drift check: the current title must still EXACTLY equal what webioom
  // itself applied. Any deviation — including a second Undo click, where
  // the current title already equals restoreValue — aborts here rather
  // than writing again.
  const currentTitle = extractResolvedTitle(readResult.resolvedTags) ?? ''

  if (currentTitle !== historyRow.applied_value) {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'Cannot undo safely. This title has changed in Wix since the fix was applied.',
    }
  }

  // Exactly one, field-specific, already-response-validated mutation — the
  // same constrained writer the original Apply used.
  const updateResult = await executeWixTitleMutation(mapping.resourceType, accessToken, mapping.itemId, readResult.ownTags, restoreValue)

  if (updateResult.status !== 'success') {
    return { rollbackWriteStatus: 'failed', reason: mutationFailureMessage(updateResult.reason) }
  }

  // Exactly one, read-only, single-attempt public-site check, performed
  // only AFTER the Admin rollback above already reported success. Expected
  // value is the RESTORED (previous) title; "value before this write" is
  // the title being undone — used only to detect the 'pending' (caching)
  // case, never to change what's expected.
  const verification = await verifyWixPublicValue({
    pageUrl: historyRow.page_url,
    expectedValue: restoreValue,
    valueBeforeThisWrite: historyRow.applied_value,
    extract: getTitleText,
    fieldLabel: 'title',
  })

  // The original history row is never modified or deleted — this inserts a
  // NEW row representing the rollback as its own historical event, with
  // previous/applied values swapped relative to the original fix.
  const historyStatus = await recordFixHistory({
    websiteId,
    platform: WIX_PLATFORM,
    issueTitle: `Rollback: ${historyRow.issue_title}`,
    pageUrl: historyRow.page_url,
    resourceType: mapping.resourceType,
    resourceId: null,
    resourceGid: updateResult.itemId,
    field: 'title',
    previousValue: historyRow.applied_value,
    appliedValue: restoreValue,
    verificationStatus: verification.status,
  })

  revalidatePath(`/dashboard/websites/${websiteId}`)

  return {
    rollbackWriteStatus: 'success',
    resourceType: mapping.resourceType,
    itemId: updateResult.itemId,
    restoredTitle: restoreValue,
    verification,
    historyStatus,
  }
}
