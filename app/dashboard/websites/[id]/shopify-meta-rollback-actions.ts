'use server'

import { revalidatePath } from 'next/cache'
import { getValidShopifyAccessToken } from './shopify-credentials'
import { resolveShopifyResource } from '@/lib/integrations/shopify/resource-mapping'
import { getGrantedShopifyScopes } from '@/lib/integrations/shopify/scopes'
import { evaluateShopifyFixCapability, type ShopifyResourceFamily } from '@/lib/integrations/shopify/capabilities'
import { readCurrentMetaDescription, writeMetaDescription, mappingFailureMessage, mutationFailureMessage } from './shopify-meta-fix-actions'
import { SHOPIFY_PLATFORM } from '@/lib/integrations/shopify/platform'
import { getFixHistoryRowForRollback, isShopifyRollbackEligibleByShape, recordFixHistory, type FixHistoryInsertResult } from './fix-history'

export type RollbackShopifyMetaFixState =
  | {
      rollbackWriteStatus: 'success'
      resourceType: ShopifyResourceFamily
      resourceGid: string
      restoredValue: string
      historyStatus: FixHistoryInsertResult
    }
  | { rollbackWriteStatus: 'failed'; reason: string }
  | null

/**
 * Phase 20.1F — reverses one previous webioom Shopify Meta Description fix
 * (Product, Collection, Page, or Article). Mirrors
 * shopify-title-rollback-actions.ts's rechecking sequence exactly (fresh
 * ownership, fresh token, fresh scopes, fresh resource re-resolution,
 * identity confirmation, fresh capability, exact-value drift check), with
 * the same two Phase 20.1E-R additions Apply itself has:
 *
 * - Product/Collection: the CURRENT fresh seo.title is preserved exactly
 *   (readCurrentMetaDescription + writeMetaDescription echo it back
 *   unchanged) — never a historical title value, which could be stale.
 * - Page/Article: the CURRENT fresh metafield `type` is re-read and reused
 *   for the restore write — never guessed, never trusted from history. If
 *   the metafield no longer exists (or its type cannot be proven) since the
 *   original fix, Undo fails closed rather than guessing a type to create
 *   one. Because Apply itself only ever succeeds when writing onto an
 *   ALREADY-EXISTING metafield (see shopify-meta-fix-actions.ts's
 *   Phase-20.1E-R fail-closed rule), a successful history row's
 *   previous_value can never represent "the metafield did not exist" —
 *   restoring it is always a normal metafieldsSet write onto a metafield
 *   proven to still exist right now, never a deletion. This is why no
 *   metafield-deletion semantics are implemented or needed here.
 */
export async function rollbackShopifyMetaFix(_prevState: RollbackShopifyMetaFixState, formData: FormData): Promise<RollbackShopifyMetaFixState> {
  const websiteId = formData.get('websiteId') as string | null
  const fixHistoryId = formData.get('fixHistoryId') as string | null

  if (!websiteId || !fixHistoryId) {
    return { rollbackWriteStatus: 'failed', reason: 'Missing information for this request.' }
  }

  const tokenResult = await getValidShopifyAccessToken(websiteId)
  if (!tokenResult.ok) {
    return { rollbackWriteStatus: 'failed', reason: 'Shopify is not connected (or the connection needs attention) for this website.' }
  }
  const { myshopifyDomain, accessToken } = tokenResult

  const historyRow = await getFixHistoryRowForRollback(websiteId, fixHistoryId)

  if (!historyRow) {
    return { rollbackWriteStatus: 'failed', reason: 'This fix could not be found.' }
  }

  if (!isShopifyRollbackEligibleByShape(historyRow) || historyRow.field !== 'meta_description') {
    return { rollbackWriteStatus: 'failed', reason: 'This change cannot be undone.' }
  }

  const historyResourceGid = historyRow.resource_gid as string
  const historyResourceType = historyRow.resource_type as ShopifyResourceFamily
  const restoreValue = historyRow.previous_value as string

  const scopesResult = await getGrantedShopifyScopes(myshopifyDomain, accessToken)

  const mapping = await resolveShopifyResource(myshopifyDomain, accessToken, historyRow.page_url)
  if (!mapping.ok) {
    return { rollbackWriteStatus: 'failed', reason: mappingFailureMessage(mapping) }
  }

  if (mapping.resourceType !== historyResourceType || mapping.gid !== historyResourceGid) {
    return { rollbackWriteStatus: 'failed', reason: 'This fix no longer matches the current Shopify resource and cannot be undone safely.' }
  }

  const capability = evaluateShopifyFixCapability('meta_description', { resourceContext: 'resolved', resourceType: mapping.resourceType }, scopesResult)
  if (capability.status !== 'supported') {
    return { rollbackWriteStatus: 'failed', reason: 'webioom could not confirm permission to undo this update.' }
  }

  // Fresh read — authoritative for drift comparison AND (for Page/Article)
  // the exact metafield `type` this restore write must use, AND (for
  // Product/Collection) the exact SEO title this restore write must echo
  // back unchanged. Never trusted from the original Apply or from history.
  const readResult = await readCurrentMetaDescription(mapping.resourceType, myshopifyDomain, accessToken, mapping.gid)
  if (!readResult.ok) {
    return { rollbackWriteStatus: 'failed', reason: 'webioom could not confirm the current meta description before undoing this update.' }
  }

  // Phase 20.1E-R fail-closed rule, re-checked fresh here exactly as Apply
  // does: never write a Page/Article SEO metafield whose type cannot be
  // proven right now — including when the metafield was deleted since the
  // original fix. This is a NULL/ABSENT case that must never be collapsed
  // into "matches an empty string": a deleted metafield reads back as
  // currentValue === null (coerced to '' below only for the SUCCESS
  // comparison path, which this branch never reaches), not as a metafield
  // that exists with an empty value — the two are structurally different
  // states in Shopify and are never treated as equal here.
  if (readResult.mechanism === 'seo_metafield' && readResult.metafieldType === null) {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'webioom cannot safely undo this change: the underlying field no longer exists in Shopify, or its type cannot be confirmed.',
    }
  }

  // Current-state drift protection: only roll back if the live meta
  // description still exactly equals what webioom itself applied. Because
  // the branch above already proved (for seo_metafield) that the field
  // still exists, this '' coercion here only ever normalizes a genuinely
  // empty-but-present value — never an absent one — so it cannot mask the
  // null-vs-empty distinction the check above already guards.
  const currentValue = readResult.currentValue ?? ''

  if (currentValue !== historyRow.applied_value) {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'Cannot undo safely. The meta description has changed in Shopify since this fix was applied.',
    }
  }

  const updateResult = await writeMetaDescription(mapping.resourceType, myshopifyDomain, accessToken, mapping.gid, restoreValue, readResult)

  if (updateResult.status !== 'success') {
    return { rollbackWriteStatus: 'failed', reason: mutationFailureMessage(updateResult.reason) }
  }

  const historyStatus = await recordFixHistory({
    websiteId,
    platform: SHOPIFY_PLATFORM,
    issueTitle: `Rollback: ${historyRow.issue_title}`,
    pageUrl: historyRow.page_url,
    resourceType: mapping.resourceType,
    resourceId: null,
    resourceGid: updateResult.gid,
    field: 'meta_description',
    previousValue: historyRow.applied_value,
    appliedValue: updateResult.value,
    verificationStatus: 'admin_rollback_succeeded',
  })

  revalidatePath(`/dashboard/websites/${websiteId}`)

  return {
    rollbackWriteStatus: 'success',
    resourceType: mapping.resourceType,
    resourceGid: updateResult.gid,
    restoredValue: updateResult.value,
    historyStatus,
  }
}
