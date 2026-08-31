'use server'

import { revalidatePath } from 'next/cache'
import { getValidShopifyAccessToken } from './shopify-credentials'
import { resolveShopifyResource } from '@/lib/integrations/shopify/resource-mapping'
import { getGrantedShopifyScopes } from '@/lib/integrations/shopify/scopes'
import { evaluateShopifyFixCapability, type ShopifyResourceFamily } from '@/lib/integrations/shopify/capabilities'
import { executeTitleMutation, mappingFailureMessage, mutationFailureMessage } from './shopify-title-fix-actions'
import { SHOPIFY_PLATFORM } from '@/lib/integrations/shopify/platform'
import { getFixHistoryRowForRollback, isShopifyRollbackEligibleByShape, recordFixHistory, type FixHistoryInsertResult } from './fix-history'

export type RollbackShopifyTitleFixState =
  | {
      rollbackWriteStatus: 'success'
      resourceType: ShopifyResourceFamily
      resourceGid: string
      restoredTitle: string
      historyStatus: FixHistoryInsertResult
    }
  | { rollbackWriteStatus: 'failed'; reason: string }
  | null

/**
 * Phase 20.1F — reverses one previous webioom Shopify Title fix (Product,
 * Collection, Page, or Article). The browser may only submit `websiteId`
 * and `fixHistoryId` (an opaque reference to a fix_history row) — the
 * restore value, resource GID/type, and page URL are all re-derived
 * server-side from the trusted history row and a fresh Shopify
 * re-resolution, exactly like applyShopifyTitleFix. No preview token is
 * involved (per this phase's brief: durable history identity + fresh
 * server-side authorization/remote-state validation, not a reused
 * Prepare/Apply token).
 *
 * CORE SAFETY RULE: rollback only ever proceeds if the CURRENT Shopify
 * title still exactly equals the value webioom itself last applied — any
 * drift (a merchant, another app, or Shopify itself changing it since)
 * aborts rather than overwriting newer content. This mirrors
 * wordpress-rollback-actions.ts's rollbackFix exactly, adapted to Shopify's
 * GID-based identity and its four resource families.
 *
 * Deliberately does NOT call any public-page verification — Shopify public
 * verification is Phase 20.1G's job (see this file's `verificationStatus`
 * write below, which honestly records 'admin_rollback_succeeded' rather
 * than borrowing WordPress's verified/pending/mismatch language).
 */
export async function rollbackShopifyTitleFix(_prevState: RollbackShopifyTitleFixState, formData: FormData): Promise<RollbackShopifyTitleFixState> {
  const websiteId = formData.get('websiteId') as string | null
  const fixHistoryId = formData.get('fixHistoryId') as string | null

  if (!websiteId || !fixHistoryId) {
    return { rollbackWriteStatus: 'failed', reason: 'Missing information for this request.' }
  }

  // 1, 2, 4, 5: re-authenticates and re-verifies website ownership
  // internally (verifyWebsiteOwnership), then obtains a currently-valid
  // token — never reused from anywhere else.
  const tokenResult = await getValidShopifyAccessToken(websiteId)
  if (!tokenResult.ok) {
    return { rollbackWriteStatus: 'failed', reason: 'Shopify is not connected (or the connection needs attention) for this website.' }
  }
  const { myshopifyDomain, accessToken } = tokenResult

  // Scoped to BOTH the id and the ownership-verified website — a row from a
  // different website (or a manipulated id) can never be returned here.
  const historyRow = await getFixHistoryRowForRollback(websiteId, fixHistoryId)

  if (!historyRow) {
    return { rollbackWriteStatus: 'failed', reason: 'This fix could not be found.' }
  }

  // 6. Shape + fix-family gate: rejects any row that is not a Shopify Title
  // row belonging to this exact website — including a Shopify Meta
  // Description row, a WordPress row of any kind, or a malformed row.
  if (!isShopifyRollbackEligibleByShape(historyRow) || historyRow.field !== 'title') {
    return { rollbackWriteStatus: 'failed', reason: 'This change cannot be undone.' }
  }

  // isShopifyRollbackEligibleByShape already confirmed these are
  // present/typed. Every value used below comes from this trusted row —
  // never from the client-submitted form.
  const historyResourceGid = historyRow.resource_gid as string
  const historyResourceType = historyRow.resource_type as ShopifyResourceFamily
  const restoreValue = historyRow.previous_value as string

  // 6. Fresh scope truth — never the stored/cached value.
  const scopesResult = await getGrantedShopifyScopes(myshopifyDomain, accessToken)

  // 7. Fresh resource re-resolution from the history row's own page_url —
  // never trusts the stored resourceGid/resourceType alone, and never
  // reuses anything from the original Apply.
  const mapping = await resolveShopifyResource(myshopifyDomain, accessToken, historyRow.page_url)
  if (!mapping.ok) {
    return { rollbackWriteStatus: 'failed', reason: mappingFailureMessage(mapping) }
  }

  // 8. Identity confirmation: the freshly-resolved resource must be the
  // EXACT same resource this history row recorded — never a different
  // resource that now happens to occupy the same URL (e.g. deleted and
  // recreated with the same handle).
  if (mapping.resourceType !== historyResourceType || mapping.gid !== historyResourceGid) {
    return { rollbackWriteStatus: 'failed', reason: 'This fix no longer matches the current Shopify resource and cannot be undone safely.' }
  }

  // 9. Capability re-evaluated fresh — a scope revoked since the original
  // fix (or since a prior failed Undo attempt) is caught here, never
  // assumed still granted.
  const capability = evaluateShopifyFixCapability('title', { resourceContext: 'resolved', resourceType: mapping.resourceType }, scopesResult)
  if (capability.status !== 'supported') {
    return { rollbackWriteStatus: 'failed', reason: 'webioom could not confirm permission to undo this update.' }
  }

  // 9, 10, 11. Drift check: the current Admin title must still EXACTLY
  // equal what webioom itself applied. Exact comparison, never
  // whitespace-normalized — matching applyShopifyTitleFix's own drift
  // check, since Shopify's title field has no equivalent to WordPress's
  // save-pipeline reformatting that would justify normalization. Any
  // deviation — including a second Undo click, where the current title
  // already equals restoreValue rather than the originally applied value —
  // aborts here rather than writing again.
  const currentTitle = mapping.title ?? ''

  if (currentTitle !== historyRow.applied_value) {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'Cannot undo safely. This title has changed in Shopify since the fix was applied.',
    }
  }

  // 12, 13. Exactly one, field-specific, already-response-validated
  // mutation — the same constrained writer the original Apply used.
  const updateResult = await executeTitleMutation(mapping.resourceType, myshopifyDomain, accessToken, mapping.gid, restoreValue)

  if (updateResult.status !== 'success') {
    return { rollbackWriteStatus: 'failed', reason: mutationFailureMessage(updateResult.reason) }
  }

  // 14. The original history row is never modified or deleted — this
  // inserts a NEW row representing the rollback as its own historical
  // event, with previous/applied values swapped relative to the original
  // fix, exactly mirroring wordpress-rollback-actions.ts's own pattern.
  const historyStatus = await recordFixHistory({
    websiteId,
    platform: SHOPIFY_PLATFORM,
    issueTitle: `Rollback: ${historyRow.issue_title}`,
    pageUrl: historyRow.page_url,
    resourceType: mapping.resourceType,
    resourceId: null,
    resourceGid: updateResult.gid,
    field: 'title',
    previousValue: historyRow.applied_value,
    appliedValue: updateResult.title,
    verificationStatus: 'admin_rollback_succeeded',
  })

  revalidatePath(`/dashboard/websites/${websiteId}`)

  return {
    rollbackWriteStatus: 'success',
    resourceType: mapping.resourceType,
    resourceGid: updateResult.gid,
    restoredTitle: updateResult.title,
    historyStatus,
  }
}
