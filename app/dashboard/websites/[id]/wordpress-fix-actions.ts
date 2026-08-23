'use server'

import { revalidatePath } from 'next/cache'
import { loadWordPressEditableContent } from '@/lib/integrations/wordpress/editable-content'
import { checkWordPressCapabilities } from '@/lib/integrations/wordpress/capabilities'
import { updateWordPressTitle } from '@/lib/integrations/wordpress/write-title'
import { verifyTitleFix, type TitleFixVerification } from '@/lib/fixes/verify-title-fix'
import { signPreviewToken, verifyPreviewToken } from '@/lib/fixes/preview-token'
import { generateTitleRecommendation } from '@/lib/ai/title-recommendation'
import { getConnectedWordPressCredentials } from './wordpress-credentials'
import { recordFixHistory } from './fix-history'
import {
  buildFixPreview,
  classifyIssueForFixPreview,
  getTitleIssueKind,
  type FixPreview,
  type ResolvedTitleProposal,
} from '@/lib/fixes/fix-preview'

export type PrepareFixState = FixPreview | null

/**
 * Read-only: for issue types outside the supported fix family, returns
 * 'unsupported' immediately — no credentials touched, no WordPress request
 * made. For supported (title / meta-description) issues, maps the scanned
 * page URL fresh, loads the exact editable resource, and — only for title
 * issues — attempts an AI-assisted title recommendation (falling back to
 * the existing deterministic proposal on any AI failure or invalid output)
 * before composing the Current -> Proposed preview. Never writes to
 * WordPress or the database. Triggered only when the user explicitly
 * requests it for one page at a time — at most one AI request per click.
 *
 * A 'ready' result carries a server-signed previewToken (see
 * lib/fixes/preview-token.ts) that tamper-evidently records exactly what
 * was previewed — website, page, issue, current value, and the approved
 * proposed value. Apply Fix trusts only this token, never a plain
 * client-submitted proposed value, which is what makes it safe to offer a
 * non-reproducible AI-generated proposal at all.
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

  let resolvedProposal: ResolvedTitleProposal | undefined

  if (content.status === 'loaded' && classifyIssueForFixPreview(issueTitle) === 'title') {
    const issueKind = getTitleIssueKind(issueTitle)

    if (issueKind) {
      let pagePath = content.permalink
      try {
        pagePath = new URL(content.permalink).pathname
      } catch {
        // Keep the permalink itself if it's somehow unparsable — still safe, just less minimal.
      }

      // The only AI call in the codebase. Only page content/identity is
      // sent — never credentials, never unrelated account data. Falls back
      // internally (never throws) on any provider failure or invalid output.
      const recommendation = await generateTitleRecommendation({
        currentTitle: content.title,
        slug: content.slug,
        pagePath,
        websiteName: credentials.websiteName,
        resourceType: content.resourceType,
        issueKind,
        rawContent: content.content,
      })

      if (recommendation.status === 'generated') {
        resolvedProposal = {
          proposedValue: recommendation.proposedTitle,
          explanation: recommendation.explanation,
          source: 'ai',
        }
      }
      // On 'fallback', resolvedProposal stays undefined — buildFixPreview's
      // own existing deterministic path below runs exactly as before.
    }
  }

  const preview = buildFixPreview(issueTitle, content, credentials.websiteName, resolvedProposal)

  if (preview.status !== 'ready') {
    return preview
  }

  let previewToken: string
  try {
    previewToken = signPreviewToken({
      websiteId,
      pageUrl,
      issueTitle,
      expectedCurrentValue: preview.currentValue ?? '',
      proposedValue: preview.proposedValue,
    })
  } catch {
    // FIX_PREVIEW_SIGNING_KEY missing/malformed — without it Apply Fix
    // cannot be trusted, so no preview is offered rather than risk one that
    // can't later be safely approved.
    return {
      status: 'unavailable',
      reason: 'Website Care could not prepare this fix right now. Please try again shortly.',
    }
  }

  return { ...preview, previewToken }
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
 * write path in the codebase. The browser submits ONLY the opaque
 * previewToken — website, page, issue, expected current value, and the
 * exact approved proposed value are all extracted from the verified,
 * signed token, never trusted as separate plain form fields. A tampered or
 * expired token is rejected outright before any WordPress or database
 * access. Ownership is still re-verified fresh on every request regardless
 * of what the token claims.
 *
 * After a successful write, a separate targeted PUBLIC-page verification
 * runs (see verifyTitleFix) to check whether the fix actually took effect on
 * the live site. A verification outcome other than 'verified' never means
 * the WordPress write itself failed — writeStatus and verification are
 * reported as two independent facts.
 */
export async function applyFix(_prevState: ApplyFixState, formData: FormData): Promise<ApplyFixState> {
  const previewToken = formData.get('previewToken') as string | null

  if (!previewToken) {
    return { writeStatus: 'failed', reason: 'Missing information for this request.' }
  }

  const verified = verifyPreviewToken(previewToken)

  if (!verified.ok) {
    return {
      writeStatus: 'failed',
      reason:
        verified.reason === 'expired'
          ? 'This fix preview has expired. Please prepare the fix again.'
          : 'This fix preview could not be verified. Please prepare the fix again.',
    }
  }

  const { websiteId, pageUrl, issueTitle, expectedCurrentValue, proposedValue } = verified.payload

  // Only the three supported title issues may ever reach a write. This is
  // re-checked independently of whatever the signed token claims.
  const issueKind = getTitleIssueKind(issueTitle)
  if (!issueKind) {
    return { writeStatus: 'failed', reason: 'This fix type is not supported.' }
  }

  // Re-verifies Website Care session + website ownership internally before
  // ever touching wordpress_connections — never trusts the token's
  // websiteId as proof the current session may act on it.
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

  // Stale-preview protection: compare the freshly-reloaded current title
  // against the token's expected current value. A missing/null title is
  // represented as '' on both sides so the comparison stays deterministic.
  if ((content.title ?? '') !== expectedCurrentValue) {
    return {
      writeStatus: 'failed',
      reason: 'This page has changed in WordPress since the fix was prepared. Please prepare the fix again.',
    }
  }

  const restBase = content.resourceType === 'page' ? 'pages' : 'posts'

  const updateResult = await updateWordPressTitle(
    credentials.websiteUrl,
    restBase,
    content.resourceId,
    content.permalink,
    proposedValue,
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
