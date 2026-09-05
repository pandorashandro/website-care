'use server'

import { getValidWixAccessToken } from './wix-credentials'
import { getTrustedWixTitleIssue } from './wix-title-issue'
import { resolveWixResource, mappingFailureMessage } from '@/lib/integrations/wix/resource-mapping'
import { getWixSiteIdentity } from '@/lib/integrations/wix/site-identity'
import { evaluateWixFixCapability, capabilityFailureMessage, type WixFixCapabilityContext } from '@/lib/integrations/wix/capabilities'
import { generateWixTitleProposal, validateWixTitle } from '@/lib/integrations/wix/title-proposal'
import {
  readWixItemSeoTags,
  extractResolvedTitle,
  updateWixBlogPostTitle,
  updateWixStoresProductTitle,
  mutationFailureMessage,
  type WixSeoItemType,
  type WixSeoTag,
  type WixSeoTagsUpdateResult,
} from '@/lib/integrations/wix/seo-tags'
import { generateWixTitleRecommendation } from '@/lib/ai/wix-title-recommendation'
import { signWixTitlePreviewToken, verifyWixTitlePreviewToken } from '@/lib/fixes/preview-token'
import { WIX_PLATFORM } from '@/lib/integrations/wix/platform'
import { recordFixHistory, type FixHistoryInsertResult } from './fix-history'
import { getTitleText } from '@/lib/scanner/checks'
import { verifyWixPublicValue, type WixPublicVerification } from '@/lib/fixes/verify-wix-public-value'
import type { WixResourceFamily } from '@/lib/integrations/wix/resource-mapping'

/**
 * Wix V1 Prompt 2 — Safe Title Fix for Blog Post and Stores Product.
 * Mirrors shopify-title-fix-actions.ts's full rechecking sequence
 * exactly. `writeStatus: 'admin_write_succeeded'` means only that the Wix
 * Admin API confirmed the write — `verification` (public storefront check)
 * is a fully separate, independently-reported fact, never collapsed into
 * writeStatus, per Wix's own documented warning that Set Item SEO Tags'
 * response "isn't a read of the published revision... don't treat it as
 * confirmation that the live page changed."
 */

function itemTypeToWixSeoItemType(resourceType: WixResourceFamily): WixSeoItemType {
  return resourceType === 'blog_post' ? 'BLOG_POST' : 'STORES_PRODUCT'
}

function pathFromUrl(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

// ---------------------------------------------------------------------------
// Prepare
// ---------------------------------------------------------------------------

export type PrepareWixTitleFixState =
  | {
      status: 'ready'
      resourceType: WixResourceFamily
      currentTitle: string
      proposedValue: string
      pageUrl: string
      explanation: string
      previewToken: string
    }
  | { status: 'unavailable'; reason: string }
  | null

/**
 * Read-only with respect to merchant content. Never writes to Wix. Starts
 * only from an opaque `issueId` — never a browser-submitted page URL or
 * title.
 */
export async function prepareWixTitleFix(_prevState: PrepareWixTitleFixState, formData: FormData): Promise<PrepareWixTitleFixState> {
  const websiteId = formData.get('websiteId') as string | null
  const issueId = formData.get('issueId') as string | null

  if (!websiteId || !issueId) {
    return { status: 'unavailable', reason: 'Missing information for this request.' }
  }

  const trustedIssue = await getTrustedWixTitleIssue(websiteId, issueId)
  if (!trustedIssue.ok) {
    return { status: 'unavailable', reason: trustedIssue.reason }
  }

  const tokenResult = await getValidWixAccessToken(websiteId)
  if (!tokenResult.ok) {
    return { status: 'unavailable', reason: 'Wix is not connected (or the connection needs attention) for this website.' }
  }
  const { accessToken } = tokenResult

  const mapping = await resolveWixResource(accessToken, trustedIssue.issue.pageUrl)
  if (!mapping.ok) {
    return { status: 'unavailable', reason: mappingFailureMessage(mapping) }
  }

  const itemType = itemTypeToWixSeoItemType(mapping.resourceType)
  const readResult = await readWixItemSeoTags(accessToken, itemType, mapping.itemId)
  if (!readResult.ok) {
    return { status: 'unavailable', reason: 'webioom could not read the current title from Wix right now.' }
  }

  const siteIdentity = await getWixSiteIdentity(accessToken)
  const isPrimaryLanguage =
    siteIdentity.ok && (readResult.language === null || readResult.language === siteIdentity.primaryLanguageCode)

  const capabilityContext: WixFixCapabilityContext = { resourceType: mapping.resourceType, isPrimaryLanguage }
  const capability = evaluateWixFixCapability('title', capabilityContext)

  if (capability.status !== 'supported') {
    return { status: 'unavailable', reason: capabilityFailureMessage(capability) }
  }

  const currentTitle = extractResolvedTitle(readResult.resolvedTags) ?? ''
  const pagePath = pathFromUrl(trustedIssue.issue.pageUrl)

  const recommendation = await generateWixTitleRecommendation({
    currentTitle: currentTitle || null,
    slug: mapping.slug,
    pagePath,
    websiteName: null,
    resourceType: mapping.resourceType,
    issueKind: trustedIssue.issue.issueKind,
  })

  const proposalOutcome =
    recommendation.status === 'generated'
      ? { ok: true as const, proposedValue: recommendation.proposedTitle, explanation: recommendation.explanation }
      : (() => {
          const deterministic = generateWixTitleProposal(trustedIssue.issue.issueKind, {
            currentTitle: currentTitle || null,
            slug: mapping.slug,
            websiteName: null,
          })
          return deterministic.ok
            ? { ok: true as const, proposedValue: deterministic.proposedValue, explanation: 'webioom generated this title from the resource’s existing information.' }
            : { ok: false as const, reason: deterministic.reason }
        })()

  if (!proposalOutcome.ok) {
    return { status: 'unavailable', reason: proposalOutcome.reason }
  }

  const validated = validateWixTitle(proposalOutcome.proposedValue)
  if (!validated.ok) {
    return { status: 'unavailable', reason: validated.reason }
  }

  // "Unchanged value rejected" (this phase's brief, Part 5): a proposal
  // identical to the current value is not a fix — refuse to create a
  // preview for it rather than let the user approve a no-op.
  if (validated.value === currentTitle) {
    return { status: 'unavailable', reason: 'The current title already matches what webioom would suggest — no change is needed.' }
  }

  let previewToken: string
  try {
    previewToken = signWixTitlePreviewToken({
      issueId,
      websiteId,
      pageUrl: trustedIssue.issue.pageUrl,
      issueTitle: trustedIssue.issue.issueTitle,
      field: 'title',
      itemType: mapping.resourceType,
      itemId: mapping.itemId,
      expectedCurrentTitle: currentTitle,
      proposedValue: validated.value,
    })
  } catch {
    return { status: 'unavailable', reason: 'webioom could not prepare this fix right now. Please try again shortly.' }
  }

  return {
    status: 'ready',
    resourceType: mapping.resourceType,
    currentTitle,
    proposedValue: validated.value,
    pageUrl: trustedIssue.issue.pageUrl,
    explanation: proposalOutcome.explanation,
    previewToken,
  }
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export type ApplyWixTitleFixState =
  | {
      writeStatus: 'admin_write_succeeded'
      resourceType: WixResourceFamily
      itemId: string
      previousTitle: string
      newTitle: string
      pageUrl: string
      verification: WixPublicVerification
      historyStatus: FixHistoryInsertResult
    }
  | { writeStatus: 'already_applied'; resourceType: WixResourceFamily; itemId: string; currentTitle: string }
  | { writeStatus: 'failed'; reason: string }
  | null

/**
 * Resource-type dispatch for the title mutation — exported so
 * wix-title-rollback-actions.ts can restore a title through the exact same
 * constrained, resource-specific writer Apply used.
 */
export async function executeWixTitleMutation(
  resourceType: WixResourceFamily,
  accessToken: string,
  itemId: string,
  currentOwnTags: WixSeoTag[],
  title: string
): Promise<WixSeoTagsUpdateResult> {
  return resourceType === 'blog_post'
    ? updateWixBlogPostTitle(accessToken, itemId, currentOwnTags, title)
    : updateWixStoresProductTitle(accessToken, itemId, currentOwnTags, title)
}

/**
 * Applies a previously-previewed Wix title fix. The browser submits ONLY
 * the opaque previewToken. Every fact the token carries is independently
 * RE-DERIVED and compared fresh below before any mutation is attempted.
 */
export async function applyWixTitleFix(_prevState: ApplyWixTitleFixState, formData: FormData): Promise<ApplyWixTitleFixState> {
  const previewToken = formData.get('previewToken') as string | null

  if (!previewToken) {
    return { writeStatus: 'failed', reason: 'Missing information for this request.' }
  }

  const verified = verifyWixTitlePreviewToken(previewToken)
  if (!verified.ok) {
    return {
      writeStatus: 'failed',
      reason: verified.reason === 'expired' ? 'This fix preview has expired. Please prepare the fix again.' : 'This fix preview could not be verified. Please prepare the fix again.',
    }
  }

  const { payload } = verified

  const trustedIssue = await getTrustedWixTitleIssue(payload.websiteId, payload.issueId)
  if (!trustedIssue.ok) {
    return { writeStatus: 'failed', reason: trustedIssue.reason }
  }

  if (trustedIssue.issue.pageUrl !== payload.pageUrl || trustedIssue.issue.issueTitle !== payload.issueTitle) {
    return { writeStatus: 'failed', reason: 'This fix preview is no longer valid. Please prepare the fix again.' }
  }

  const revalidated = validateWixTitle(payload.proposedValue)
  if (!revalidated.ok) {
    return { writeStatus: 'failed', reason: 'This fix preview is no longer valid. Please prepare the fix again.' }
  }

  const tokenResult = await getValidWixAccessToken(payload.websiteId)
  if (!tokenResult.ok) {
    return { writeStatus: 'failed', reason: 'Wix is not connected (or the connection needs attention) for this website.' }
  }
  const { accessToken } = tokenResult

  const mapping = await resolveWixResource(accessToken, trustedIssue.issue.pageUrl)
  if (!mapping.ok) {
    return { writeStatus: 'failed', reason: mappingFailureMessage(mapping) }
  }

  // Identity confirmation: the freshly-resolved resource must be the
  // EXACT same resource the preview was approved for.
  if (mapping.resourceType !== payload.itemType || mapping.itemId !== payload.itemId) {
    return { writeStatus: 'failed', reason: 'This fix no longer matches the current Wix resource and cannot be applied safely.' }
  }

  const itemType = itemTypeToWixSeoItemType(mapping.resourceType)

  // Fresh read — authoritative for both the drift check AND the tags array
  // this write must preserve unrelated entries from. The SAME read serves
  // both purposes, minimizing the TOCTOU window (see
  // lib/integrations/wix/seo-tags.ts's module doc comment — no ETag exists
  // on this API).
  const readResult = await readWixItemSeoTags(accessToken, itemType, mapping.itemId)
  if (!readResult.ok) {
    return { writeStatus: 'failed', reason: 'webioom could not confirm the current title before applying this update.' }
  }

  const siteIdentity = await getWixSiteIdentity(accessToken)
  const isPrimaryLanguage =
    siteIdentity.ok && (readResult.language === null || readResult.language === siteIdentity.primaryLanguageCode)

  const capability = evaluateWixFixCapability('title', { resourceType: mapping.resourceType, isPrimaryLanguage })
  if (capability.status !== 'supported') {
    return { writeStatus: 'failed', reason: 'webioom could not confirm permission to apply this update. Please prepare the fix again.' }
  }

  const currentTitle = extractResolvedTitle(readResult.resolvedTags) ?? ''

  if (currentTitle !== payload.expectedCurrentTitle) {
    if (currentTitle === revalidated.value) {
      return { writeStatus: 'already_applied', resourceType: mapping.resourceType, itemId: mapping.itemId, currentTitle }
    }
    return { writeStatus: 'failed', reason: 'This page has changed in Wix since the fix was prepared. Please prepare the fix again.' }
  }

  const updateResult = await executeWixTitleMutation(mapping.resourceType, accessToken, mapping.itemId, readResult.ownTags, revalidated.value)

  if (updateResult.status !== 'success') {
    return { writeStatus: 'failed', reason: mutationFailureMessage(updateResult.reason) }
  }

  // Public storefront check — performed only AFTER the Admin mutation
  // above already reported success. Never feeds back into another
  // mutation or rollback.
  const verification = await verifyWixPublicValue({
    pageUrl: trustedIssue.issue.pageUrl,
    expectedValue: revalidated.value,
    valueBeforeThisWrite: currentTitle,
    extract: getTitleText,
    fieldLabel: 'title',
  })

  // Recorded only AFTER the mutation above already reported success.
  const historyStatus = await recordFixHistory({
    websiteId: payload.websiteId,
    platform: WIX_PLATFORM,
    issueTitle: trustedIssue.issue.issueTitle,
    pageUrl: trustedIssue.issue.pageUrl,
    resourceType: mapping.resourceType,
    resourceId: null,
    resourceGid: updateResult.itemId,
    field: 'title',
    previousValue: currentTitle,
    appliedValue: revalidated.value,
    verificationStatus: verification.status,
  })

  return {
    writeStatus: 'admin_write_succeeded',
    resourceType: mapping.resourceType,
    itemId: updateResult.itemId,
    previousTitle: currentTitle,
    newTitle: revalidated.value,
    pageUrl: trustedIssue.issue.pageUrl,
    verification,
    historyStatus,
  }
}
