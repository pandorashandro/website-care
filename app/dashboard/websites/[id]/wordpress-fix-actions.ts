'use server'

import { revalidatePath } from 'next/cache'
import { loadWordPressEditableContent } from '@/lib/integrations/wordpress/editable-content'
import { checkWordPressCapabilities } from '@/lib/integrations/wordpress/capabilities'
import { updateWordPressTitle } from '@/lib/integrations/wordpress/write-title'
import { verifyTitleFix, type TitleFixVerification } from '@/lib/fixes/verify-title-fix'
import { getConnectedWordPressCredentials } from './wordpress-credentials'
import { recordFixHistory } from './fix-history'
import {
  buildFixPreview,
  classifyIssueForFixPreview,
  getTitleIssueKind,
  type FixPreview,
} from '@/lib/fixes/fix-preview'
import { generateTitleProposal } from '@/lib/fixes/title-preview'

export type PrepareFixState = FixPreview | null

/**
 * Read-only: for issue types outside the supported fix family, returns
 * 'unsupported' immediately — no credentials touched, no WordPress request
 * made. For supported (title / meta-description) issues, maps the scanned
 * page URL fresh, loads the exact editable resource, and — only for title
 * issues — generates a deterministic Current -> Proposed preview. Never
 * writes to WordPress or the database. Triggered only when the user
 * explicitly requests it for one page at a time.
 */
export async function prepareFix(
  _prevState: PrepareFixState,
  formData: FormData
): Promise<PrepareFixState> {
  const websiteId = formData.get('websiteId') as string | null
  const pageUrl = formData.get('pageUrl') as string | null
  const issueTitle = formData.get('issueTitle') as string | null

  if (!websiteId || !pageUrl || !issueTitle) {
    return { status: 'unavailable', reason: 'Missing information for this request.' }
  }

  if (classifyIssueForFixPreview(issueTitle) === 'unsupported') {
    return { status: 'unsupported', reason: 'Preview not available yet for this fix type.' }
  }

  // Re-verifies Website Care session + website ownership internally before
  // ever touching wordpress_connections — never trusts the form's websiteId alone.
  const credentials = await getConnectedWordPressCredentials(websiteId)

  if (!credentials.ok) {
    return {
      status: 'unavailable',
      reason: 'WordPress is not connected (or the connection needs attention) for this website.',
    }
  }

  const content = await loadWordPressEditableContent(
    credentials.websiteUrl,
    pageUrl,
    credentials.username,
    credentials.applicationPassword
  )

  return buildFixPreview(issueTitle, content, credentials.websiteName)
}

export type ApplyFixState =
  | {
      writeStatus: 'success'
      appliedTitle: string
      verification: TitleFixVerification
      historyStatus: 'saved' | 'failed'
    }
  | { writeStatus: 'failed'; reason: string }
  | null

/**
 * Applies a previously-previewed title fix to WordPress. This is the only
 * write path in the codebase. Nothing the browser submits is trusted as the
 * value or location to write to — `resourceId`, the REST base, and the
 * proposed title are all re-derived server-side from scratch, exactly as if
 * Prepare Fix had never run. `expectedCurrentValue`/`expectedProposedValue`
 * are used ONLY as staleness checks against what is freshly reloaded here;
 * if either has drifted since the preview was shown, the write is aborted
 * and the user is asked to prepare the fix again rather than risk writing
 * something the user never actually saw confirmed.
 *
 * After a successful write, a separate targeted PUBLIC-page verification
 * runs (see verifyTitleFix) to check whether the fix actually took effect on
 * the live site. A verification outcome other than 'verified' never means
 * the WordPress write itself failed — writeStatus and verification are
 * reported as two independent facts.
 */
export async function applyFix(_prevState: ApplyFixState, formData: FormData): Promise<ApplyFixState> {
  const websiteId = formData.get('websiteId') as string | null
  const pageUrl = formData.get('pageUrl') as string | null
  const issueTitle = formData.get('issueTitle') as string | null
  const expectedCurrentValue = formData.get('expectedCurrentValue')
  const expectedProposedValue = formData.get('expectedProposedValue')

  if (
    !websiteId ||
    !pageUrl ||
    !issueTitle ||
    typeof expectedCurrentValue !== 'string' ||
    typeof expectedProposedValue !== 'string'
  ) {
    return { writeStatus: 'failed', reason: 'Missing information for this request.' }
  }

  // Only the three supported title issues may ever reach a write. This is
  // re-checked independently of whatever the Prepare Fix step showed.
  const issueKind = getTitleIssueKind(issueTitle)
  if (!issueKind) {
    return { writeStatus: 'failed', reason: 'This fix type is not supported.' }
  }

  // Re-verifies Website Care session + website ownership internally before
  // ever touching wordpress_connections — never trusts the form's websiteId alone.
  const credentials = await getConnectedWordPressCredentials(websiteId)

  if (!credentials.ok) {
    return {
      writeStatus: 'failed',
      reason: 'WordPress is not connected (or the connection needs attention) for this website.',
    }
  }

  // Fresh mapping + fresh resource reload — never reuses anything from the
  // earlier Prepare Fix call. Also reconfirms the resource's permalink still
  // matches the mapping, protecting against the page having moved.
  const content = await loadWordPressEditableContent(
    credentials.websiteUrl,
    pageUrl,
    credentials.username,
    credentials.applicationPassword
  )

  if (content.status !== 'loaded') {
    return { writeStatus: 'failed', reason: content.reason }
  }

  // Capability gating is resource-type-specific now that the exact resource
  // is known — a page requires canEditPages, a post requires canEditPosts.
  // 'unavailable' and 'unknown' both fail closed; only 'available' permits a write.
  const capabilityResult = await checkWordPressCapabilities(
    credentials.websiteUrl,
    credentials.username,
    credentials.applicationPassword
  )

  if (!capabilityResult.connectionValid) {
    return { writeStatus: 'failed', reason: 'WordPress access has been revoked for this connection.' }
  }

  const requiredCapability =
    content.resourceType === 'page' ? capabilityResult.capabilities.canEditPages : capabilityResult.capabilities.canEditPosts

  if (requiredCapability !== 'available') {
    return {
      writeStatus: 'failed',
      reason: 'The connected WordPress account does not have permission to edit this content.',
    }
  }

  // Stale-preview protection (1/2): compare the freshly-reloaded current
  // title against what the client last saw. A missing/null title is
  // represented as '' on both sides so the comparison stays deterministic.
  if ((content.title ?? '') !== expectedCurrentValue) {
    return {
      writeStatus: 'failed',
      reason: 'This page has changed in WordPress since the fix was prepared. Please prepare the fix again.',
    }
  }

  // The proposal is regenerated from scratch here — the client's proposed
  // value is never trusted as the value to write.
  const proposal = generateTitleProposal(issueKind, {
    currentTitle: content.title,
    slug: content.slug,
    websiteName: credentials.websiteName,
  })

  if (!proposal.ok) {
    return { writeStatus: 'failed', reason: proposal.reason }
  }

  // Stale-preview protection (2/2): if the freshly-regenerated proposal no
  // longer matches what the client last saw (e.g. the website's own name
  // changed), treat it as stale too rather than silently writing something
  // different from what was confirmed on screen.
  if (proposal.proposedValue !== expectedProposedValue) {
    return {
      writeStatus: 'failed',
      reason: 'The proposed fix has changed since it was prepared. Please prepare the fix again.',
    }
  }

  const restBase = content.resourceType === 'page' ? 'pages' : 'posts'

  const updateResult = await updateWordPressTitle(
    credentials.websiteUrl,
    restBase,
    content.resourceId,
    content.permalink,
    proposal.proposedValue,
    credentials.username,
    credentials.applicationPassword
  )

  if (updateResult.status !== 'success') {
    return { writeStatus: 'failed', reason: updateResult.reason }
  }

  // Exactly one targeted public verification attempt — no retries, no
  // polling. Runs only after the WordPress write is already confirmed
  // successful, and fetches the PUBLIC page (never the authenticated
  // WordPress REST API), so it never carries any WordPress credential.
  const verification = await verifyTitleFix({
    pageUrl: content.permalink,
    originalIssueKind: issueKind,
    expectedAppliedTitle: updateResult.title,
    previousValue: content.title,
  })

  // Recorded regardless of verification outcome — even 'unavailable' is a
  // real applied change and must be auditable. websiteId is already
  // ownership-verified (getConnectedWordPressCredentials succeeded above),
  // and every other value here is server-derived, never taken from the form.
  const historyStatus = await recordFixHistory({
    websiteId,
    issueTitle,
    pageUrl: content.permalink,
    resourceType: content.resourceType,
    resourceId: content.resourceId,
    previousValue: content.title,
    appliedValue: updateResult.title,
    verificationStatus: verification.status,
  })

  revalidatePath(`/dashboard/websites/${websiteId}`)

  return { writeStatus: 'success', appliedTitle: updateResult.title, verification, historyStatus }
}
