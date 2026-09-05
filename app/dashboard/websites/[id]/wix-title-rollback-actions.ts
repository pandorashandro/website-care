'use server'

import { revalidatePath } from 'next/cache'
import { getValidWixAccessToken } from './wix-credentials'
import { resolveWixResource } from '@/lib/integrations/wix/resource-mapping'
import { getWixSiteIdentity } from '@/lib/integrations/wix/site-identity'
import { evaluateWixFixCapability } from '@/lib/integrations/wix/capabilities'
import { readWixItemSeoTags, extractResolvedTitle } from '@/lib/integrations/wix/seo-tags'
import { WIX_PLATFORM } from '@/lib/integrations/wix/platform'
import { getFixHistoryRowForRollback, isWixRollbackEligibleByShape, recordFixHistory, type FixHistoryInsertResult } from './fix-history'
import { getTitleText } from '@/lib/scanner/checks'
import { verifyWixPublicValue, type WixPublicVerification } from '@/lib/fixes/verify-wix-public-value'
import { mappingFailureMessage, mutationFailureMessage, executeWixTitleMutation } from './wix-title-fix-actions'
import type { WixResourceFamily } from '@/lib/integrations/wix/resource-mapping'

export type RollbackWixTitleFixState =
  | {
      rollbackWriteStatus: 'success'
      resourceType: WixResourceFamily
      itemId: string
      restoredTitle: string
      verification: WixPublicVerification
      historyStatus: FixHistoryInsertResult
    }
  | { rollbackWriteStatus: 'failed'; reason: string }
  | null

/**
 * Wix V1 Prompt 2 — reverses one previous webioom Wix Title fix (Blog Post
 * or Stores Product). The browser may only submit `websiteId` and
 * `fixHistoryId` — the restore value, resource identity, and page URL are
 * all re-derived server-side from the trusted history row and a fresh Wix
 * re-resolution, exactly like applyWixTitleFix. No preview token is
 * involved.
 *
 * CORE SAFETY RULE: rollback only ever proceeds if the CURRENT Wix title
 * still exactly equals the value webioom itself last applied — any drift
 * (a merchant, another app, or Wix itself changing it since) aborts
 * rather than overwriting newer content. Mirrors
 * wix-title-fix-actions.ts's applyWixTitleFix drift check exactly.
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

  // Scoped to BOTH the id and the ownership-verified website — a row from
  // a different website (or a manipulated id) can never be returned here.
  const historyRow = await getFixHistoryRowForRollback(websiteId, fixHistoryId)

  if (!historyRow) {
    return { rollbackWriteStatus: 'failed', reason: 'This fix could not be found.' }
  }

  // Shape + fix-family gate: rejects any row that is not a Wix Title row
  // belonging to this exact website — including a Wix Meta Description
  // row, a WordPress/Shopify row of any kind, or a malformed row.
  if (!isWixRollbackEligibleByShape(historyRow) || historyRow.field !== 'title') {
    return { rollbackWriteStatus: 'failed', reason: 'This change cannot be undone.' }
  }

  const historyItemId = historyRow.resource_gid as string
  const historyResourceType = historyRow.resource_type as WixResourceFamily
  const restoreValue = historyRow.previous_value as string

  // Fresh resource re-resolution from the history row's own page_url —
  // never trusts the stored itemId/resourceType alone.
  const mapping = await resolveWixResource(accessToken, historyRow.page_url)
  if (!mapping.ok) {
    return { rollbackWriteStatus: 'failed', reason: mappingFailureMessage(mapping) }
  }

  // Identity confirmation: the freshly-resolved resource must be the EXACT
  // same resource this history row recorded.
  if (mapping.resourceType !== historyResourceType || mapping.itemId !== historyItemId) {
    return { rollbackWriteStatus: 'failed', reason: 'This fix no longer matches the current Wix resource and cannot be undone safely.' }
  }

  const itemType = mapping.resourceType === 'blog_post' ? 'BLOG_POST' : 'STORES_PRODUCT'

  const readResult = await readWixItemSeoTags(accessToken, itemType, mapping.itemId)
  if (!readResult.ok) {
    return { rollbackWriteStatus: 'failed', reason: 'webioom could not confirm the current title before undoing this update.' }
  }

  const siteIdentity = await getWixSiteIdentity(accessToken)
  const isPrimaryLanguage =
    siteIdentity.ok && (readResult.language === null || readResult.language === siteIdentity.primaryLanguageCode)

  const capability = evaluateWixFixCapability('title', { resourceType: mapping.resourceType, isPrimaryLanguage })
  if (capability.status !== 'supported') {
    return { rollbackWriteStatus: 'failed', reason: 'webioom could not confirm permission to undo this update.' }
  }

  // Drift check: the current title must still EXACTLY equal what webioom
  // itself applied. Any deviation — including a second Undo click, where
  // the current title already equals restoreValue rather than the
  // originally applied value — aborts here rather than writing again.
  const currentTitle = extractResolvedTitle(readResult.resolvedTags) ?? ''

  if (currentTitle !== historyRow.applied_value) {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'Cannot undo safely. This title has changed in Wix since the fix was applied.',
    }
  }

  const updateResult = await executeWixTitleMutation(mapping.resourceType, accessToken, mapping.itemId, readResult.ownTags, restoreValue)

  if (updateResult.status !== 'success') {
    return { rollbackWriteStatus: 'failed', reason: mutationFailureMessage(updateResult.reason) }
  }

  const verification = await verifyWixPublicValue({
    pageUrl: historyRow.page_url,
    expectedValue: restoreValue,
    valueBeforeThisWrite: historyRow.applied_value,
    extract: getTitleText,
    fieldLabel: 'title',
  })

  // The original history row is never modified or deleted — this inserts
  // a NEW row representing the rollback as its own historical event, with
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
