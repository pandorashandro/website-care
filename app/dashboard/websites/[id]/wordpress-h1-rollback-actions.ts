'use server'

import { revalidatePath } from 'next/cache'
import { loadWordPressEditableContent } from '@/lib/integrations/wordpress/editable-content'
import { checkWordPressCapabilities } from '@/lib/integrations/wordpress/capabilities'
import { updateWordPressH1Content } from '@/lib/integrations/wordpress/write-h1-content'
import { classifyH1ContentSource } from '@/lib/fixes/h1-source-detection'
import { buildH1InsertionSnippet } from '@/lib/fixes/h1-content-transform'
import { verifyH1Rollback, type H1RollbackVerification } from '@/lib/fixes/verify-h1-rollback'
import { getConnectedWordPressCredentials } from './wordpress-credentials'
import { getFixHistoryRowForRollback, isRollbackEligibleByShape, recordFixHistory } from './fix-history'

export type RollbackH1FixState =
  | {
      rollbackWriteStatus: 'success'
      verification: H1RollbackVerification
      historyStatus: 'saved' | 'failed'
    }
  | { rollbackWriteStatus: 'failed'; reason: string }
  | null

/**
 * Reverses one previous Website Care missing-H1 fix. The browser may only
 * submit `websiteId` and `fixHistoryId` — exactly like title/meta rollback,
 * no signed token is involved here.
 *
 * fix_history has no column for "which exact bytes were inserted," and this
 * phase deliberately does not add one. Instead, the exact snippet that was
 * inserted is deterministically RECONSTRUCTED — from the freshly-detected
 * current content source plus history.applied_value (the approved H1 text),
 * both already available without a schema change — using the same pure
 * lib/fixes/h1-content-transform.ts helper Apply used to build it in the
 * first place. Rollback only proceeds if that exact, byte-for-byte
 * reconstructed snippet is found EXACTLY ONCE in the freshly-reloaded
 * content.raw; it is then removed as a single substring, and nothing else
 * in content.raw is touched. Any drift — the snippet not present, present
 * more than once, or WordPress having reformatted it — aborts safely rather
 * than guessing which H1 (or which content) to touch.
 */
export async function rollbackH1Fix(_prevState: RollbackH1FixState, formData: FormData): Promise<RollbackH1FixState> {
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

  if (!isRollbackEligibleByShape(historyRow) || historyRow.field !== 'h1') {
    return { rollbackWriteStatus: 'failed', reason: 'This change cannot be undone.' }
  }

  const resourceType = historyRow.resource_type as 'page' | 'post'
  const resourceId = historyRow.resource_id as number
  const appliedH1 = historyRow.applied_value

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

  // Fresh source classification — never inferred from history.
  const source = classifyH1ContentSource(content.content)

  if (source !== 'gutenberg' && source !== 'classic_html') {
    return { rollbackWriteStatus: 'failed', reason: 'This heading can no longer be safely undone.' }
  }

  const expectedSnippet = buildH1InsertionSnippet({ source, proposedH1: appliedH1 })

  if (!expectedSnippet) {
    return { rollbackWriteStatus: 'failed', reason: 'This heading can no longer be safely undone.' }
  }

  const rawContent = content.content ?? ''
  const occurrenceCount = rawContent.split(expectedSnippet).length - 1

  if (occurrenceCount !== 1) {
    return {
      rollbackWriteStatus: 'failed',
      reason: 'Cannot undo safely. This heading has changed since it was applied.',
    }
  }

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

  // Removes exactly the one confirmed occurrence of the exact snippet —
  // nothing else in rawContent is touched.
  const updatedContent = rawContent.replace(expectedSnippet, '')

  const restBase = resourceType === 'page' ? 'pages' : 'posts'

  const updateResult = await updateWordPressH1Content({
    websiteUrl: credentials.websiteUrl,
    restBase,
    resourceId,
    expectedPermalink: content.permalink,
    updatedContent,
    username: credentials.username,
    applicationPassword: credentials.applicationPassword,
  })

  if (updateResult.status !== 'success') {
    return { rollbackWriteStatus: 'failed', reason: updateResult.reason }
  }

  // Confirm the snippet is actually gone from the returned content.
  if (updateResult.contentRaw.includes(expectedSnippet)) {
    return {
      rollbackWriteStatus: 'failed',
      reason: "WordPress's response did not confirm the heading was removed.",
    }
  }

  const verification = await verifyH1Rollback({ pageUrl: content.permalink, removedH1: appliedH1 })

  // The original history row is never modified or deleted — this inserts a
  // NEW row representing the rollback as its own historical event.
  const historyStatus = await recordFixHistory({
    websiteId,
    issueTitle: `Rollback: ${historyRow.issue_title}`,
    pageUrl: historyRow.page_url,
    resourceType,
    resourceId,
    field: 'h1',
    previousValue: appliedH1,
    appliedValue: '',
    verificationStatus: verification.status,
  })

  revalidatePath(`/dashboard/websites/${websiteId}`)

  return { rollbackWriteStatus: 'success', verification, historyStatus }
}
