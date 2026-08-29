'use server'

import { revalidatePath } from 'next/cache'
import {
  WORDPRESS_PLATFORM,
  wordpressResources,
  wordpressCapabilities,
  wordpressMetadataProvider,
  wordpressWriters,
} from '@/lib/integrations/wordpress/adapter'
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
 * Reverses one previous webioom meta-description fix, for Yoast or
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

  const content = await wordpressResources.loadEditable(
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
  const providerResult = await wordpressMetadataProvider.detect(
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

  // Phase 19.5B-S — same-mechanism proof: isRollbackEligibleByShape already
  // confirmed historyRow.write_strategy is a recognized meta_description
  // value (never null — legacy rows written before this phase fail that
  // check and never reach here). The currently, freshly re-detected
  // provider must resolve to that EXACT SAME write mechanism — not merely
  // "some" currently-writable provider — before any write is attempted.
  // Provider alone fully determines the mechanism (YOAST_META_FIELD /
  // RANK_MATH_META_FIELD are fixed constants, never variable per resource),
  // so this one comparison proves both "same provider" and "same field."
  const currentWriteStrategy = wordpressMetadataProvider.toWriteStrategy(provider)

  if (currentWriteStrategy !== historyRow.write_strategy) {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'webioom could not confirm the same SEO field used by the original fix, so Undo was not performed.',
    }
  }

  const capabilityResult = await wordpressCapabilities.check(
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
  // webioom itself applied.
  const currentValueNormalized = normalizeForComparison(providerResult.currentMetaDescription ?? '')
  const appliedValueNormalized = normalizeForComparison(historyRow.applied_value)

  if (currentValueNormalized !== appliedValueNormalized) {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'Cannot undo safely. The meta description has changed since this fix was applied.',
    }
  }

  const restBase = resourceType === 'page' ? 'pages' : 'posts'

  const updateResult = await wordpressWriters.metaDescription({
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
  // writeStrategy carries forward the same currentWriteStrategy just proven
  // to match the original fix, so the rollback row is itself internally
  // consistent and, if ever undone again, provides the same proof.
  const historyStatus = await recordFixHistory({
    websiteId,
    platform: WORDPRESS_PLATFORM,
    issueTitle: `Rollback: ${historyRow.issue_title}`,
    pageUrl: historyRow.page_url,
    resourceType,
    resourceId,
    field: 'meta_description',
    writeStrategy: currentWriteStrategy,
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
