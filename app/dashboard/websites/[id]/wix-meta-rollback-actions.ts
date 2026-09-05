'use server'

import { revalidatePath } from 'next/cache'
import { getValidWixAccessToken } from './wix-credentials'
import { resolveWixResource, mappingFailureMessage, type WixResourceFamily } from '@/lib/integrations/wix/resource-mapping'
import { getWixSiteIdentity } from '@/lib/integrations/wix/site-identity'
import { evaluateWixFixCapability, capabilityFailureMessage } from '@/lib/integrations/wix/capabilities'
import {
  readWixItemSeoTags,
  extractResolvedMetaDescription,
  updateWixBlogPostMetaDescription,
  updateWixStoresProductMetaDescription,
  mutationFailureMessage,
  type WixSeoTag,
  type WixSeoTagsUpdateResult,
} from '@/lib/integrations/wix/seo-tags'
import { WIX_PLATFORM } from '@/lib/integrations/wix/platform'
import { getFixHistoryRowForRollback, isWixRollbackEligibleByShape, recordFixHistory, type FixHistoryInsertResult } from './fix-history'
import { getMetaDescriptionContent } from '@/lib/scanner/checks'
import { verifyWixPublicValue, type WixPublicVerification } from '@/lib/fixes/verify-wix-public-value'

export type RollbackWixMetaFixState =
  | {
      rollbackWriteStatus: 'success'
      resourceType: WixResourceFamily
      itemId: string
      restoredValue: string
      /** Public-site verification of the ROLLBACK, independent of `rollbackWriteStatus`. */
      verification: WixPublicVerification
      historyStatus: FixHistoryInsertResult
    }
  | { rollbackWriteStatus: 'failed'; reason: string }
  | null

function itemTypeToWixSeoItemType(resourceType: WixResourceFamily): 'BLOG_POST' | 'STORES_PRODUCT' {
  return resourceType === 'blog_post' ? 'BLOG_POST' : 'STORES_PRODUCT'
}

async function executeWixMetaMutation(
  resourceType: WixResourceFamily,
  accessToken: string,
  itemId: string,
  currentOwnTags: WixSeoTag[],
  description: string
): Promise<WixSeoTagsUpdateResult> {
  return resourceType === 'blog_post'
    ? updateWixBlogPostMetaDescription(accessToken, itemId, currentOwnTags, description)
    : updateWixStoresProductMetaDescription(accessToken, itemId, currentOwnTags, description)
}

/**
 * Wix V1 Prompt 3 — reverses one previous webioom Wix Meta Description fix
 * (Blog Post or Stores Product). Mirrors wix-title-rollback-actions.ts's
 * rechecking sequence exactly (fresh ownership/token, fresh resource
 * re-resolution, identity confirmation, fresh capability, exact-value drift
 * check), differing only in field and shared-helper reuse
 * (mappingFailureMessage/capabilityFailureMessage/mutationFailureMessage are
 * imported from their respective lib/integrations/wix/ modules rather than
 * duplicated).
 */
export async function rollbackWixMetaFix(_prevState: RollbackWixMetaFixState, formData: FormData): Promise<RollbackWixMetaFixState> {
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

  const historyRow = await getFixHistoryRowForRollback(websiteId, fixHistoryId)

  if (!historyRow) {
    return { rollbackWriteStatus: 'failed', reason: 'This fix could not be found.' }
  }

  if (!isWixRollbackEligibleByShape(historyRow) || historyRow.field !== 'meta_description') {
    return { rollbackWriteStatus: 'failed', reason: 'This change cannot be undone.' }
  }

  const historyItemId = historyRow.resource_gid as string
  const historyResourceType = historyRow.resource_type as WixResourceFamily
  const restoreValue = historyRow.previous_value as string

  const mapping = await resolveWixResource(accessToken, historyRow.page_url)
  if (!mapping.ok) {
    return { rollbackWriteStatus: 'failed', reason: mappingFailureMessage(mapping) }
  }

  if (mapping.resourceType !== historyResourceType || mapping.itemId !== historyItemId) {
    return { rollbackWriteStatus: 'failed', reason: 'This fix no longer matches the current Wix resource and cannot be undone safely.' }
  }

  const itemType = itemTypeToWixSeoItemType(mapping.resourceType)

  const readResult = await readWixItemSeoTags(accessToken, itemType, mapping.itemId)
  if (!readResult.ok) {
    return { rollbackWriteStatus: 'failed', reason: 'webioom could not confirm the current meta description before undoing this update.' }
  }

  const siteIdentity = await getWixSiteIdentity(accessToken)
  const isPrimaryLanguage =
    siteIdentity.ok && (readResult.language === null || readResult.language === siteIdentity.primaryLanguageCode)

  const capability = evaluateWixFixCapability('meta_description', { resourceType: mapping.resourceType, isPrimaryLanguage })
  if (capability.status !== 'supported') {
    return { rollbackWriteStatus: 'failed', reason: capabilityFailureMessage(capability) }
  }

  const currentValue = extractResolvedMetaDescription(readResult.resolvedTags) ?? ''

  if (currentValue !== historyRow.applied_value) {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'Cannot undo safely. The meta description has changed in Wix since this fix was applied.',
    }
  }

  const updateResult = await executeWixMetaMutation(mapping.resourceType, accessToken, mapping.itemId, readResult.ownTags, restoreValue)

  if (updateResult.status !== 'success') {
    return { rollbackWriteStatus: 'failed', reason: mutationFailureMessage(updateResult.reason) }
  }

  const verification = await verifyWixPublicValue({
    pageUrl: historyRow.page_url,
    expectedValue: restoreValue,
    valueBeforeThisWrite: historyRow.applied_value,
    extract: getMetaDescriptionContent,
    fieldLabel: 'meta description',
  })

  const historyStatus = await recordFixHistory({
    websiteId,
    platform: WIX_PLATFORM,
    issueTitle: `Rollback: ${historyRow.issue_title}`,
    pageUrl: historyRow.page_url,
    resourceType: mapping.resourceType,
    resourceId: null,
    resourceGid: updateResult.itemId,
    field: 'meta_description',
    previousValue: historyRow.applied_value,
    appliedValue: restoreValue,
    verificationStatus: verification.status,
  })

  revalidatePath(`/dashboard/websites/${websiteId}`)

  return {
    rollbackWriteStatus: 'success',
    resourceType: mapping.resourceType,
    itemId: updateResult.itemId,
    restoredValue: restoreValue,
    verification,
    historyStatus,
  }
}
