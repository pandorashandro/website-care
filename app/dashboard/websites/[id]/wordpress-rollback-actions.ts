'use server'

import { revalidatePath } from 'next/cache'
import { wordpressResources, wordpressCapabilities, wordpressWriters } from '@/lib/integrations/wordpress/adapter'
import { verifyRollback, type RollbackVerification } from '@/lib/fixes/verify-rollback'
import { getConnectedWordPressCredentials } from './wordpress-credentials'
import { getFixHistoryRowForRollback, isRollbackEligibleByShape, recordFixHistory } from './fix-history'

export type RollbackFixState =
  | {
      rollbackWriteStatus: 'success'
      restoredTitle: string
      verification: RollbackVerification
      historyStatus: 'saved' | 'failed'
    }
  | { rollbackWriteStatus: 'failed'; reason: string }
  | null

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Reverses one previous webioom WordPress title fix. The browser may
 * only submit `websiteId` and `fixHistoryId` (an opaque reference to a
 * fix_history row) — the restore value, resource id/type, and REST path are
 * all re-derived server-side from the trusted history row and a fresh
 * WordPress reload, exactly like applyFix. Rollback only ever proceeds if
 * the CURRENT WordPress title still exactly equals (whitespace normalized)
 * the value webioom itself last applied — any drift (a human or plugin
 * changing it since) aborts rather than overwriting newer content. This is
 * still a title-only write, using the same constrained writer as the
 * original fix.
 */
export async function rollbackFix(_prevState: RollbackFixState, formData: FormData): Promise<RollbackFixState> {
  const websiteId = formData.get('websiteId') as string | null
  const fixHistoryId = formData.get('fixHistoryId') as string | null

  if (!websiteId || !fixHistoryId) {
    return { rollbackWriteStatus: 'failed', reason: 'Missing information for this request.' }
  }

  // Re-verifies webioom session + website ownership internally before
  // ever touching fix_history or wordpress_connections.
  const credentials = await getConnectedWordPressCredentials(websiteId)

  if (!credentials.ok) {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'WordPress is not connected (or the connection needs attention) for this website.',
    }
  }

  // Scoped to BOTH the id and the ownership-verified website — a row from a
  // different website can never be returned here.
  const historyRow = await getFixHistoryRowForRollback(websiteId, fixHistoryId)

  if (!historyRow) {
    return { rollbackWriteStatus: 'failed', reason: 'This fix could not be found.' }
  }

  if (!isRollbackEligibleByShape(historyRow) || historyRow.field !== 'title') {
    return { rollbackWriteStatus: 'failed', reason: 'This change cannot be undone.' }
  }

  // isRollbackEligibleByShape already confirmed these are present/typed.
  const resourceType = historyRow.resource_type as 'page' | 'post'
  const resourceId = historyRow.resource_id as number
  const restoreValue = historyRow.previous_value as string

  // Fresh mapping + fresh resource reload from the history row's own
  // page_url — never trusts anything client-submitted, and never reuses a
  // stale resourceId without reconfirming it against a live remap.
  const content = await wordpressResources.loadEditable(
    credentials.websiteUrl,
    historyRow.page_url,
    credentials.username,
    credentials.applicationPassword
  )

  if (content.status !== 'loaded') {
    return { rollbackWriteStatus: 'failed', reason: content.reason }
  }

  // The page's current mapping must still point at the exact same resource
  // this history row recorded (e.g. protects against the slug being reused
  // by a different page/post since the original fix).
  if (content.resourceType !== resourceType || content.resourceId !== resourceId) {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'This fix no longer matches the current WordPress resource and cannot be undone safely.',
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

  // Current-state drift protection: only roll back if the live title still
  // exactly matches (whitespace normalized) what webioom itself
  // applied. Anything else — a human or plugin edit since — aborts rather
  // than silently overwriting newer content.
  const currentTitleNormalized = normalizeForComparison(content.title ?? '')
  const appliedValueNormalized = normalizeForComparison(historyRow.applied_value)

  if (currentTitleNormalized !== appliedValueNormalized) {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'Cannot undo safely. The WordPress title has changed since this fix was applied.',
    }
  }

  const restBase = resourceType === 'page' ? 'pages' : 'posts'

  const updateResult = await wordpressWriters.title(
    credentials.websiteUrl,
    restBase,
    resourceId,
    content.permalink,
    restoreValue,
    credentials.username,
    credentials.applicationPassword
  )

  if (updateResult.status !== 'success') {
    return { rollbackWriteStatus: 'failed', reason: updateResult.reason }
  }

  // Exactly one targeted public verification attempt, same as the original
  // fix flow — no retries, no polling.
  const verification = await verifyRollback({
    pageUrl: content.permalink,
    restoredValue: updateResult.title,
    valueBeforeRollback: historyRow.applied_value,
  })

  // The original history row is never modified or deleted — this inserts a
  // NEW row representing the rollback as its own historical event, with
  // previous/applied values swapped relative to the original fix.
  const historyStatus = await recordFixHistory({
    websiteId,
    issueTitle: `Rollback: ${historyRow.issue_title}`,
    pageUrl: historyRow.page_url,
    resourceType,
    resourceId,
    field: 'title',
    previousValue: historyRow.applied_value,
    appliedValue: updateResult.title,
    verificationStatus: verification.status,
  })

  revalidatePath(`/dashboard/websites/${websiteId}`)

  return {
    rollbackWriteStatus: 'success',
    restoredTitle: updateResult.title,
    verification,
    historyStatus,
  }
}
