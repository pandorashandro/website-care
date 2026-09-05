'use server'

import { getValidWixAccessToken } from './wix-credentials'
import { getTrustedWixMetaIssue } from './wix-meta-issue'
import { resolveWixResource, type WixResourceFamily } from '@/lib/integrations/wix/resource-mapping'
import { getWixSiteIdentity } from '@/lib/integrations/wix/site-identity'
import { evaluateWixFixCapability, type WixFixCapabilityContext } from '@/lib/integrations/wix/capabilities'
import { validateWixMetaDescription } from '@/lib/integrations/wix/meta-proposal'
import {
  readWixItemSeoTags,
  extractResolvedTitle,
  extractResolvedMetaDescription,
  updateWixBlogPostMetaDescription,
  updateWixStoresProductMetaDescription,
  type WixSeoTagsUpdateResult,
  type WixSeoTag,
} from '@/lib/integrations/wix/seo-tags'
import { generateWixMetaDescriptionRecommendation } from '@/lib/ai/wix-meta-description-recommendation'
import { signWixMetaPreviewToken, verifyWixMetaPreviewToken } from '@/lib/fixes/preview-token'
import { WIX_PLATFORM } from '@/lib/integrations/wix/platform'
import { recordFixHistory, type FixHistoryInsertResult } from './fix-history'
import { getMetaDescriptionContent } from '@/lib/scanner/checks'
import { verifyWixPublicValue, type WixPublicVerification } from '@/lib/fixes/verify-wix-public-value'
import { mappingFailureMessage, capabilityFailureMessage, mutationFailureMessage } from './wix-title-fix-actions'

/**
 * Wix V1 Prompt 2 — Safe Meta Description Fix for Blog Post and Stores
 * Product. Mirrors wix-title-fix-actions.ts's rechecking sequence exactly
 * (fresh ownership, fresh token, fresh resource re-resolution, identity
 * confirmation, fresh capability, exact-value drift check, already-applied
 * idempotency), differing only in field and shared-helper reuse
 * (mappingFailureMessage/capabilityFailureMessage/mutationFailureMessage
 * are imported from wix-title-fix-actions.ts rather than duplicated —
 * their wording is field-agnostic).
 */

function itemTypeToWixSeoItemType(resourceType: WixResourceFamily): 'BLOG_POST' | 'STORES_PRODUCT' {
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

export type PrepareWixMetaFixState =
  | {
      status: 'ready'
      resourceType: WixResourceFamily
      currentValue: string
      proposedValue: string
      pageUrl: string
      explanation: string
      previewToken: string
    }
  | { status: 'unavailable'; reason: string }
  | null

export async function prepareWixMetaFix(_prevState: PrepareWixMetaFixState, formData: FormData): Promise<PrepareWixMetaFixState> {
  const websiteId = formData.get('websiteId') as string | null
  const issueId = formData.get('issueId') as string | null

  if (!websiteId || !issueId) {
    return { status: 'unavailable', reason: 'Missing information for this request.' }
  }

  const trustedIssue = await getTrustedWixMetaIssue(websiteId, issueId)
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
    return { status: 'unavailable', reason: 'webioom could not read the current meta description from Wix right now.' }
  }

  const siteIdentity = await getWixSiteIdentity(accessToken)
  const isPrimaryLanguage =
    siteIdentity.ok && (readResult.language === null || readResult.language === siteIdentity.primaryLanguageCode)

  const capabilityContext: WixFixCapabilityContext = { resourceType: mapping.resourceType, isPrimaryLanguage }
  const capability = evaluateWixFixCapability('meta_description', capabilityContext)

  if (capability.status !== 'supported') {
    return { status: 'unavailable', reason: capabilityFailureMessage(capability) }
  }

  const currentValue = extractResolvedMetaDescription(readResult.resolvedTags) ?? ''
  const currentTitle = extractResolvedTitle(readResult.resolvedTags)
  const pagePath = pathFromUrl(trustedIssue.issue.pageUrl)

  const recommendation = await generateWixMetaDescriptionRecommendation({
    currentMetaDescription: currentValue || null,
    currentTitle,
    slug: mapping.slug,
    pagePath,
    websiteName: null,
    resourceType: mapping.resourceType,
    issueKind: trustedIssue.issue.issueKind,
  })

  if (recommendation.status !== 'generated') {
    return { status: 'unavailable', reason: recommendation.explanation }
  }

  const validated = validateWixMetaDescription(recommendation.proposedMetaDescription)
  if (!validated.ok) {
    return { status: 'unavailable', reason: validated.reason }
  }

  if (validated.value === currentValue) {
    return { status: 'unavailable', reason: 'The current meta description already matches what webioom would suggest — no change is needed.' }
  }

  let previewToken: string
  try {
    previewToken = signWixMetaPreviewToken({
      issueId,
      websiteId,
      pageUrl: trustedIssue.issue.pageUrl,
      issueTitle: trustedIssue.issue.issueTitle,
      field: 'meta_description',
      itemType: mapping.resourceType,
      itemId: mapping.itemId,
      expectedCurrentValue: currentValue,
      proposedValue: validated.value,
    })
  } catch {
    return { status: 'unavailable', reason: 'webioom could not prepare this fix right now. Please try again shortly.' }
  }

  return {
    status: 'ready',
    resourceType: mapping.resourceType,
    currentValue,
    proposedValue: validated.value,
    pageUrl: trustedIssue.issue.pageUrl,
    explanation: recommendation.explanation,
    previewToken,
  }
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export type ApplyWixMetaFixState =
  | {
      writeStatus: 'admin_write_succeeded'
      resourceType: WixResourceFamily
      itemId: string
      field: 'meta_description'
      previousValue: string
      newValue: string
      pageUrl: string
      verification: WixPublicVerification
      historyStatus: FixHistoryInsertResult
    }
  | { writeStatus: 'already_applied'; resourceType: WixResourceFamily; itemId: string; currentValue: string }
  | { writeStatus: 'failed'; reason: string }
  | null

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

export async function applyWixMetaFix(_prevState: ApplyWixMetaFixState, formData: FormData): Promise<ApplyWixMetaFixState> {
  const previewToken = formData.get('previewToken') as string | null

  if (!previewToken) {
    return { writeStatus: 'failed', reason: 'Missing information for this request.' }
  }

  const verified = verifyWixMetaPreviewToken(previewToken)
  if (!verified.ok) {
    return {
      writeStatus: 'failed',
      reason: verified.reason === 'expired' ? 'This fix preview has expired. Please prepare the fix again.' : 'This fix preview could not be verified. Please prepare the fix again.',
    }
  }

  const { payload } = verified

  const trustedIssue = await getTrustedWixMetaIssue(payload.websiteId, payload.issueId)
  if (!trustedIssue.ok) {
    return { writeStatus: 'failed', reason: trustedIssue.reason }
  }

  if (trustedIssue.issue.pageUrl !== payload.pageUrl || trustedIssue.issue.issueTitle !== payload.issueTitle) {
    return { writeStatus: 'failed', reason: 'This fix preview is no longer valid. Please prepare the fix again.' }
  }

  const revalidated = validateWixMetaDescription(payload.proposedValue)
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

  if (mapping.resourceType !== payload.itemType || mapping.itemId !== payload.itemId) {
    return { writeStatus: 'failed', reason: 'This fix no longer matches the current Wix resource and cannot be applied safely.' }
  }

  const itemType = itemTypeToWixSeoItemType(mapping.resourceType)

  const readResult = await readWixItemSeoTags(accessToken, itemType, mapping.itemId)
  if (!readResult.ok) {
    return { writeStatus: 'failed', reason: 'webioom could not confirm the current meta description before applying this update.' }
  }

  const siteIdentity = await getWixSiteIdentity(accessToken)
  const isPrimaryLanguage =
    siteIdentity.ok && (readResult.language === null || readResult.language === siteIdentity.primaryLanguageCode)

  const capability = evaluateWixFixCapability('meta_description', { resourceType: mapping.resourceType, isPrimaryLanguage })
  if (capability.status !== 'supported') {
    return { writeStatus: 'failed', reason: 'webioom could not confirm permission to apply this update. Please prepare the fix again.' }
  }

  const currentValue = extractResolvedMetaDescription(readResult.resolvedTags) ?? ''

  if (currentValue !== payload.expectedCurrentValue) {
    if (currentValue === revalidated.value) {
      return { writeStatus: 'already_applied', resourceType: mapping.resourceType, itemId: mapping.itemId, currentValue }
    }
    return { writeStatus: 'failed', reason: 'This page has changed in Wix since the fix was prepared. Please prepare the fix again.' }
  }

  const updateResult = await executeWixMetaMutation(mapping.resourceType, accessToken, mapping.itemId, readResult.ownTags, revalidated.value)

  if (updateResult.status !== 'success') {
    return { writeStatus: 'failed', reason: mutationFailureMessage(updateResult.reason) }
  }

  const verification = await verifyWixPublicValue({
    pageUrl: trustedIssue.issue.pageUrl,
    expectedValue: revalidated.value,
    valueBeforeThisWrite: currentValue,
    extract: getMetaDescriptionContent,
    fieldLabel: 'meta description',
  })

  const historyStatus = await recordFixHistory({
    websiteId: payload.websiteId,
    platform: WIX_PLATFORM,
    issueTitle: trustedIssue.issue.issueTitle,
    pageUrl: trustedIssue.issue.pageUrl,
    resourceType: mapping.resourceType,
    resourceId: null,
    resourceGid: updateResult.itemId,
    field: 'meta_description',
    previousValue: currentValue,
    appliedValue: revalidated.value,
    verificationStatus: verification.status,
  })

  return {
    writeStatus: 'admin_write_succeeded',
    resourceType: mapping.resourceType,
    itemId: updateResult.itemId,
    field: 'meta_description',
    previousValue: currentValue,
    newValue: revalidated.value,
    pageUrl: trustedIssue.issue.pageUrl,
    verification,
    historyStatus,
  }
}
