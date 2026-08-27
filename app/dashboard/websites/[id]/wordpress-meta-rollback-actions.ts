'use server'

import { revalidatePath } from 'next/cache'
import { loadWordPressEditableContent } from '@/lib/integrations/wordpress/editable-content'
import { checkWordPressCapabilities } from '@/lib/integrations/wordpress/capabilities'
import { detectSeoMetadataProvider } from '@/lib/integrations/wordpress/seo-provider'
import { updateWordPressMetaDescription } from '@/lib/integrations/wordpress/write-meta-description'
import {
  verifyMetaDescriptionRollback,
  type MetaDescriptionRollbackVerification,
} from '@/lib/fixes/verify-meta-description-rollback'
import { getConnectedWordPressCredentials } from './wordpress-credentials'
import { getFixHistoryRowForRollback, isRollbackEligibleByShape, recordFixHistory } from './fix-history'

export type RollbackMetaDescriptionFixState =
  | {
      rollbackWriteStatus: 'success'
      restoredMetaDescription: string
      verification: MetaDescriptionRollbackVerification
      historyStatus: 'saved' | 'failed'
    }
  | { rollbackWriteStatus: 'failed'; reason: string }
  | null

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Reverses one previous Website Care meta-description fix, for Yoast or
 * Rank Math only. The browser may only submit `websiteId` and
 * `fixHistoryId` — exactly like title rollback, no signed token is
 * involved here at all.
 *
 * fix_history has no `provider` column, and the provider is deliberately
 * never inferred from `issue_title`. Instead, this re-detects the SEO
 * provider fresh from the live resource — exactly as Apply does — and only
 * proceeds if that freshly-detected provider is writable AND its current
 * value still exactly matches history.applied_value. If the provider
 * genuinely changed since the original fix, its current value will not
 * coincidentally equal the old applied_value, so this single check also
 * serves as the provider-consistency guard without needing to store
 * anything new.
 */
export async function rollbackMetaDescriptionFix(
  _prevState: RollbackMetaDescriptionFixState,
  formData: FormData
): Promise<RollbackMetaDescriptionFixState> {
  const websiteId = formData.get('websiteId') as string | null
  const fixHistoryId = formData.get('fixHistoryId') as string | null

  if (!websiteId || !fixHistoryId) {
    return { rollbackWriteStatus: 'failed', reason: 'Missing information for this request.' }
  }

  const credentials = await getConnectedWordPressCredentials(websiteId)

  if (!credentials.ok) {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'WordPress is not connected (or the connection needs attention) for this website.',
    }
  }

  const historyRow = await getFixHistoryRowForRollback(websiteId, fixHistoryId)

  if (!historyRow) {
    return { rollbackWriteStatus: 'failed', reason: 'This fix could not be found.' }
  }

  if (!isRollbackEligibleByShape(historyRow) || historyRow.field !== 'meta_description') {
    return { rollbackWriteStatus: 'failed', reason: 'This change cannot be undone.' }
  }

  const resourceType = historyRow.resource_type as 'page' | 'post'
  const resourceId = historyRow.resource_id as number
  const restoreValue = historyRow.previous_value as string

  const content = await loadWordPressEditableContent(
    credentials.websiteUrl,
    historyRow.page_url,
    credentials.username,
    credentials.applicationPassword
  )

  if (content.status !== 'loaded') {
    return { rollbackWriteStatus: 'failed', reason: content.reason }
  }

  if (content.resourceType !== resourceType || content.resourceId !== resourceId) {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'This fix no longer matches the current WordPress resource and cannot be undone safely.',
    }
  }

  // Fresh provider re-detection — see function doc comment. Never inferred
  // from history; must be writable now, on a supported provider.
  const providerResult = await detectSeoMetadataProvider(
    credentials.websiteUrl,
    content,
    credentials.username,
    credentials.applicationPassword
  )

  if (
    providerResult.status !== 'detected' ||
    !providerResult.writable ||
    !providerResult.writeStrategy ||
    (providerResult.provider !== 'yoast' && providerResult.provider !== 'rank_math')
  ) {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'This meta description can no longer be safely undone.',
    }
  }

  const provider = providerResult.provider

  const capabilityResult = await checkWordPressCapabilities(
    credentials.websiteUrl,
    credentials.username,
    credentials.applicationPassword
  )

  if (!capabilityResult.connectionValid) {
    return { rollbackWriteStatus: 'failed', reason: 'WordPress access has been revoked for this connection.' }
  }

  const requiredCapability =
    resourceType === 'page' ? capabilityResult.capabilities.canEditPages : capabilityResult.capabilities.canEditPosts

  if (requiredCapability !== 'available') {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'The connected WordPress account does not have permission to edit this content.',
    }
  }

  // Current-state drift protection: only roll back if the live meta
  // description still exactly matches (whitespace normalized) what
  // Website Care itself applied.
  const currentValueNormalized = normalizeForComparison(providerResult.currentMetaDescription ?? '')
  const appliedValueNormalized = normalizeForComparison(historyRow.applied_value)

  if (currentValueNormalized !== appliedValueNormalized) {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'Cannot undo safely. The meta description has changed since this fix was applied.',
    }
  }

  const restBase = resourceType === 'page' ? 'pages' : 'posts'

  const updateResult = await updateWordPressMetaDescription({
    websiteUrl: credentials.websiteUrl,
    restBase,
    resourceId,
    expectedPermalink: content.permalink,
    provider,
    metaDescription: restoreValue,
    username: credentials.username,
    applicationPassword: credentials.applicationPassword,
  })

  if (updateResult.status !== 'success') {
    return { rollbackWriteStatus: 'failed', reason: updateResult.reason }
  }

  const verification = await verifyMetaDescriptionRollback({
    pageUrl: content.permalink,
    restoredValue: updateResult.metaDescription,
    valueBeforeRollback: historyRow.applied_value,
  })

  // The original history row is never modified or deleted — this inserts a
  // NEW row representing the rollback as its own historical event.
  const historyStatus = await recordFixHistory({
    websiteId,
    issueTitle: `Rollback: ${historyRow.issue_title}`,
    pageUrl: historyRow.page_url,
    resourceType,
    resourceId,
    field: 'meta_description',
    previousValue: historyRow.applied_value,
    appliedValue: updateResult.metaDescription,
    verificationStatus: verification.status,
  })

  revalidatePath(`/dashboard/websites/${websiteId}`)

  return {
    rollbackWriteStatus: 'success',
    restoredMetaDescription: updateResult.metaDescription,
    verification,
    historyStatus,
  }
}
