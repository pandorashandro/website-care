'use server'

import { getValidShopifyAccessToken } from './shopify-credentials'
import { getTrustedShopifyMetaIssue } from './shopify-meta-issue'
import { resolveShopifyResource, type ShopifyResourceMapping } from '@/lib/integrations/shopify/resource-mapping'
import { getGrantedShopifyScopes } from '@/lib/integrations/shopify/scopes'
import { evaluateShopifyFixCapability, type ShopifyResourceFamily } from '@/lib/integrations/shopify/capabilities'
import { validateShopifyMetaDescription } from '@/lib/integrations/shopify/meta-proposal'
import {
  readShopifyProductMetaDescription,
  readShopifyCollectionMetaDescription,
  readShopifyPageMetaDescription,
  readShopifyArticleMetaDescription,
  updateShopifyProductMetaDescription,
  updateShopifyCollectionMetaDescription,
  updateShopifyPageMetaDescription,
  updateShopifyArticleMetaDescription,
  type ShopifyMetaDescriptionReadResult,
  type ShopifyMetaDescriptionUpdateResult,
} from '@/lib/integrations/shopify/meta-mutations'
import { generateShopifyMetaDescriptionRecommendation } from '@/lib/ai/shopify-meta-description-recommendation'
import { signShopifyMetaPreviewToken, verifyShopifyMetaPreviewToken } from '@/lib/fixes/preview-token'
import { SHOPIFY_PLATFORM } from '@/lib/integrations/shopify/platform'
import { recordFixHistory, type FixHistoryInsertResult } from './fix-history'

/**
 * Phase 20.1E — Shopify Safe Meta Description Fix backend foundation.
 * Same IMPORTANT SCOPE BOUNDARY as Phase 20.1D's Title fix (see that
 * file's module doc comment): `admin_write_succeeded` means only that the
 * Shopify Admin API confirmed the write — never that the public
 * `<meta name="description">` changed. renderControlProven is never
 * flipped to true here. Phase 20.1F adds durable fix_history recording on
 * a successful write, and safe Undo (see shopify-meta-rollback-actions.ts,
 * which reuses readCurrentMetaDescription/writeMetaDescription/
 * mappingFailureMessage/mutationFailureMessage exported below rather than
 * duplicating the resource-type dispatch). No UI trigger.
 */

// ---------------------------------------------------------------------------
// Read/write dispatch — Product/Collection (seo_object) and Page/Article
// (seo_metafield) have genuinely different signatures (the metafield
// writers need an extra `metafieldType`, re-derived fresh from a read —
// never trusted from anywhere else), so this is an explicit switch per
// operation rather than one falsely-uniform dispatcher.
// ---------------------------------------------------------------------------

/** Exported so shopify-meta-rollback-actions.ts's Undo flow can perform the exact same fresh read (drift comparison + proven mechanism/type) rather than a second, divergable copy. */
export async function readCurrentMetaDescription(
  resourceType: ShopifyResourceFamily,
  shopDomain: string,
  accessToken: string,
  gid: string
): Promise<ShopifyMetaDescriptionReadResult> {
  switch (resourceType) {
    case 'product':
      return readShopifyProductMetaDescription(shopDomain, accessToken, gid)
    case 'collection':
      return readShopifyCollectionMetaDescription(shopDomain, accessToken, gid)
    case 'page':
      return readShopifyPageMetaDescription(shopDomain, accessToken, gid)
    case 'article':
      return readShopifyArticleMetaDescription(shopDomain, accessToken, gid)
  }
}

/**
 * Dispatches to the correct resource-specific writer using whatever the
 * SAME fresh read (readCurrentMetaDescription, called immediately before
 * this) reported. For product/collection, `readResult.currentSeoTitle` is
 * echoed back unchanged (Phase 20.1E-R — see updateShopifyProductMetaDescription's
 * doc comment). For page/article, `readResult.metafieldType` must already
 * be non-null — callers are required to gate on that (see
 * requireProvenMetafieldType below) before ever reaching this function;
 * it is never guessed here or anywhere else.
 */
/** Exported so shopify-meta-rollback-actions.ts's Undo flow restores through the exact same constrained, resource-specific writer Apply used, never a generic one. Callers MUST pass a `readResult` freshly obtained immediately before this call — see requireProvenMetafieldType and the module doc comment above. */
export async function writeMetaDescription(
  resourceType: ShopifyResourceFamily,
  shopDomain: string,
  accessToken: string,
  gid: string,
  value: string,
  readResult: Extract<ShopifyMetaDescriptionReadResult, { ok: true }>
): Promise<ShopifyMetaDescriptionUpdateResult> {
  switch (resourceType) {
    case 'product':
      return updateShopifyProductMetaDescription(shopDomain, accessToken, gid, value, readResult.mechanism === 'seo_object' ? readResult.currentSeoTitle : null)
    case 'collection':
      return updateShopifyCollectionMetaDescription(shopDomain, accessToken, gid, value, readResult.mechanism === 'seo_object' ? readResult.currentSeoTitle : null)
    case 'page':
      return updateShopifyPageMetaDescription(shopDomain, accessToken, gid, value, requireProvenMetafieldType(readResult))
    case 'article':
      return updateShopifyArticleMetaDescription(shopDomain, accessToken, gid, value, requireProvenMetafieldType(readResult))
  }
}

/**
 * Phase 20.1E-R fail-closed gate: callers MUST confirm
 * (readResult.mechanism === 'seo_metafield' && readResult.metafieldType !== null)
 * before ever reaching writeMetaDescription for page/article — see both
 * Prepare and Apply below, which check this explicitly and return a
 * typed unavailable/failed result rather than call the writer at all when
 * it's false. This function exists only to give the writer a non-null
 * `string` at the type level once that external guarantee holds; it is
 * not itself a safety check (it throws if the guarantee was violated,
 * which should be unreachable given the guards below, not a normal
 * control-flow path).
 */
function requireProvenMetafieldType(readResult: Extract<ShopifyMetaDescriptionReadResult, { ok: true }>): string {
  if (readResult.mechanism !== 'seo_metafield' || readResult.metafieldType === null) {
    throw new Error('writeMetaDescription called for page/article without a proven metafield type.')
  }
  return readResult.metafieldType
}

function pathFromUrl(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

/** Exported so shopify-meta-rollback-actions.ts can report the exact same failure wording rather than a second, divergable copy of this switch. */
export function mappingFailureMessage(mapping: Extract<ShopifyResourceMapping, { ok: false }>): string {
  switch (mapping.reason) {
    case 'homepage_unsupported':
      return 'webioom does not yet support direct fixes for a Shopify homepage.'
    case 'localized_route_unsupported':
      return 'This page appears to use a localized or market-specific storefront URL, which webioom does not yet support for direct fixes.'
    case 'unsupported_route':
    case 'invalid_url':
      return 'webioom does not recognize this page as a supported Shopify resource.'
    case 'domain_mismatch':
      return 'This page does not appear to belong to the connected Shopify store.'
    case 'resource_not_found':
      return 'webioom could not find a matching resource in your connected Shopify store.'
    case 'ambiguous_resource':
      return 'webioom found more than one possible match for this page and cannot safely proceed.'
    case 'unauthorized':
      return 'The connected Shopify store did not accept webioom’s access. Please reconnect Shopify.'
    case 'connection_error':
      return 'webioom could not reach the connected Shopify store right now. Please try again shortly.'
    case 'malformed_response':
      return 'The connected Shopify store returned an unexpected response.'
  }
}

// ---------------------------------------------------------------------------
// Prepare
// ---------------------------------------------------------------------------

export type PrepareShopifyMetaFixState =
  | {
      status: 'ready'
      resourceType: ShopifyResourceFamily
      currentValue: string
      proposedValue: string
      pageUrl: string
      explanation: string
      previewToken: string
    }
  | { status: 'unavailable'; reason: string }
  | null

/**
 * Read-only with respect to merchant content. Starts only from an opaque
 * `issueId` — never a browser-submitted page URL or meta text. Mirrors
 * Phase 20.1D's Title Prepare flow exactly, with the one structural
 * addition that reading/writing must branch on resourceType because
 * Shopify itself does not expose meta description uniformly (see
 * meta-mutations.ts's module doc comment).
 */
export async function prepareShopifyMetaFix(_prevState: PrepareShopifyMetaFixState, formData: FormData): Promise<PrepareShopifyMetaFixState> {
  const websiteId = formData.get('websiteId') as string | null
  const issueId = formData.get('issueId') as string | null

  if (!websiteId || !issueId) {
    return { status: 'unavailable', reason: 'Missing information for this request.' }
  }

  const trustedIssue = await getTrustedShopifyMetaIssue(websiteId, issueId)
  if (!trustedIssue.ok) {
    return { status: 'unavailable', reason: trustedIssue.reason }
  }

  const tokenResult = await getValidShopifyAccessToken(websiteId)
  if (!tokenResult.ok) {
    return { status: 'unavailable', reason: 'Shopify is not connected (or the connection needs attention) for this website.' }
  }
  const { myshopifyDomain, accessToken } = tokenResult

  const scopesResult = await getGrantedShopifyScopes(myshopifyDomain, accessToken)

  const mapping = await resolveShopifyResource(myshopifyDomain, accessToken, trustedIssue.issue.pageUrl)
  if (!mapping.ok) {
    return { status: 'unavailable', reason: mappingFailureMessage(mapping) }
  }

  const capability = evaluateShopifyFixCapability('meta_description', { resourceContext: 'resolved', resourceType: mapping.resourceType }, scopesResult)

  if (capability.status !== 'supported') {
    if (capability.status === 'missing_scope') {
      return { status: 'unavailable', reason: 'The connected Shopify store does not currently grant webioom permission to edit this meta description.' }
    }
    if (capability.status === 'connection_unhealthy') {
      return { status: 'unavailable', reason: 'webioom could not confirm the Shopify connection is currently usable.' }
    }
    return { status: 'unavailable', reason: 'webioom cannot safely prepare this fix right now.' }
  }

  const readResult = await readCurrentMetaDescription(mapping.resourceType, myshopifyDomain, accessToken, mapping.gid)
  if (!readResult.ok) {
    return { status: 'unavailable', reason: 'webioom could not read the current meta description from Shopify right now.' }
  }

  // Phase 20.1E-R fail-closed rule: a Page/Article with no existing
  // global.description_tag metafield has no provable type — webioom will
  // not guess one to create it. Prepare stops here rather than issuing a
  // preview it could never safely Apply.
  if (readResult.mechanism === 'seo_metafield' && readResult.metafieldType === null) {
    return {
      status: 'unavailable',
      reason: 'webioom cannot yet safely set a new meta description for this resource — please set an initial value in Shopify admin first.',
    }
  }

  const currentValue = readResult.currentValue ?? ''
  const pagePath = pathFromUrl(trustedIssue.issue.pageUrl)

  const recommendation = await generateShopifyMetaDescriptionRecommendation({
    currentMetaDescription: readResult.currentValue,
    currentTitle: mapping.title,
    handle: mapping.handle,
    pagePath,
    websiteName: null,
    resourceType: mapping.resourceType,
    issueKind: trustedIssue.issue.issueKind,
  })

  // No deterministic fallback exists for meta descriptions — matching
  // WordPress's own established precedent (lib/ai/meta-description-recommendation.ts) —
  // so AI failure means Prepare reports unavailable, never a fabricated value.
  if (recommendation.status !== 'generated') {
    return { status: 'unavailable', reason: recommendation.explanation }
  }

  const validated = validateShopifyMetaDescription(recommendation.proposedMetaDescription)
  if (!validated.ok) {
    return { status: 'unavailable', reason: validated.reason }
  }

  let previewToken: string
  try {
    previewToken = signShopifyMetaPreviewToken({
      issueId,
      websiteId,
      pageUrl: trustedIssue.issue.pageUrl,
      issueTitle: trustedIssue.issue.issueTitle,
      field: 'meta_description',
      resourceType: mapping.resourceType,
      resourceGid: mapping.gid,
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

export type ApplyShopifyMetaFixState =
  | {
      writeStatus: 'admin_write_succeeded'
      resourceType: ShopifyResourceFamily
      resourceGid: string
      field: 'meta_description'
      previousValue: string
      newValue: string
      pageUrl: string
      /**
       * Phase 20.1F: whether this write was durably recorded to fix_history
       * (and is therefore Undo-eligible). 'failed' here means the Shopify
       * Admin write already succeeded regardless — see this file's Apply
       * doc comment — never that the meta description change should be
       * treated as not having happened.
       */
      historyStatus: FixHistoryInsertResult
    }
  | { writeStatus: 'already_applied'; resourceType: ShopifyResourceFamily; resourceGid: string; currentValue: string }
  | { writeStatus: 'failed'; reason: string }
  | null

/** Exported for reuse by shopify-meta-rollback-actions.ts — same mutation result shape, same safe user-facing wording. */
export function mutationFailureMessage(reason: Extract<ShopifyMetaDescriptionUpdateResult, { status: 'failed' }>['reason']): string {
  switch (reason) {
    case 'permission_failure':
      return 'The connected Shopify store did not allow this update (permission denied).'
    case 'validation_failure':
      return 'Shopify rejected this meta description update.'
    case 'not_found':
      return 'This Shopify resource could not be found.'
    case 'provider_error':
      return 'Shopify could not be reached to apply this update. Please try again shortly.'
    case 'malformed_response':
      return 'Shopify’s response did not confirm the meta description was updated.'
  }
}

/**
 * Applies a previously-previewed Shopify meta-description fix. Mirrors
 * Phase 20.1D's applyShopifyTitleFix rechecking sequence exactly (fresh
 * ownership, fresh token, fresh scopes, fresh resource re-resolution,
 * identity confirmation, fresh capability, exact-value drift check,
 * already-applied idempotency), with one addition: for Page/Article, the
 * metafield `type` used for the write is re-read fresh here (never
 * trusted from Prepare, never trusted from the token, which does not
 * carry it at all) — see readCurrentMetaDescription/writeMetaDescription.
 */
export async function applyShopifyMetaFix(_prevState: ApplyShopifyMetaFixState, formData: FormData): Promise<ApplyShopifyMetaFixState> {
  const previewToken = formData.get('previewToken') as string | null

  if (!previewToken) {
    return { writeStatus: 'failed', reason: 'Missing information for this request.' }
  }

  const verified = verifyShopifyMetaPreviewToken(previewToken)
  if (!verified.ok) {
    return {
      writeStatus: 'failed',
      reason: verified.reason === 'expired' ? 'This fix preview has expired. Please prepare the fix again.' : 'This fix preview could not be verified. Please prepare the fix again.',
    }
  }

  const { payload } = verified

  const trustedIssue = await getTrustedShopifyMetaIssue(payload.websiteId, payload.issueId)
  if (!trustedIssue.ok) {
    return { writeStatus: 'failed', reason: trustedIssue.reason }
  }

  if (trustedIssue.issue.pageUrl !== payload.pageUrl || trustedIssue.issue.issueTitle !== payload.issueTitle) {
    return { writeStatus: 'failed', reason: 'This fix preview is no longer valid. Please prepare the fix again.' }
  }

  const revalidated = validateShopifyMetaDescription(payload.proposedValue)
  if (!revalidated.ok) {
    return { writeStatus: 'failed', reason: 'This fix preview is no longer valid. Please prepare the fix again.' }
  }

  const tokenResult = await getValidShopifyAccessToken(payload.websiteId)
  if (!tokenResult.ok) {
    return { writeStatus: 'failed', reason: 'Shopify is not connected (or the connection needs attention) for this website.' }
  }
  const { myshopifyDomain, accessToken } = tokenResult

  const scopesResult = await getGrantedShopifyScopes(myshopifyDomain, accessToken)

  const mapping = await resolveShopifyResource(myshopifyDomain, accessToken, trustedIssue.issue.pageUrl)
  if (!mapping.ok) {
    return { writeStatus: 'failed', reason: mappingFailureMessage(mapping) }
  }

  if (mapping.resourceType !== payload.resourceType || mapping.gid !== payload.resourceGid) {
    return { writeStatus: 'failed', reason: 'This fix no longer matches the current Shopify resource and cannot be applied safely.' }
  }

  const capability = evaluateShopifyFixCapability('meta_description', { resourceContext: 'resolved', resourceType: mapping.resourceType }, scopesResult)
  if (capability.status !== 'supported') {
    return { writeStatus: 'failed', reason: 'webioom could not confirm permission to apply this update. Please prepare the fix again.' }
  }

  // Fresh read — authoritative for both drift comparison AND (for
  // Page/Article) the exact metafield `type` this write must use, and
  // (for Product/Collection) the exact SEO title this write must echo
  // back unchanged.
  const readResult = await readCurrentMetaDescription(mapping.resourceType, myshopifyDomain, accessToken, mapping.gid)
  if (!readResult.ok) {
    return { writeStatus: 'failed', reason: 'webioom could not confirm the current meta description before applying this update.' }
  }

  // Phase 20.1E-R fail-closed rule, re-checked fresh at Apply (state can
  // change between Prepare and Apply — e.g. the metafield could have been
  // deleted in the interim): never write a Page/Article SEO metafield
  // whose type cannot be proven.
  if (readResult.mechanism === 'seo_metafield' && readResult.metafieldType === null) {
    return {
      writeStatus: 'failed',
      reason: 'webioom cannot safely set a new meta description for this resource. Please prepare the fix again.',
    }
  }

  const currentValue = readResult.currentValue ?? ''

  if (currentValue !== payload.expectedCurrentValue) {
    if (currentValue === revalidated.value) {
      return { writeStatus: 'already_applied', resourceType: mapping.resourceType, resourceGid: mapping.gid, currentValue }
    }
    return { writeStatus: 'failed', reason: 'This page has changed in Shopify since the fix was prepared. Please prepare the fix again.' }
  }

  const updateResult = await writeMetaDescription(mapping.resourceType, myshopifyDomain, accessToken, mapping.gid, revalidated.value, readResult)

  if (updateResult.status !== 'success') {
    return { writeStatus: 'failed', reason: mutationFailureMessage(updateResult.reason) }
  }

  // Recorded only AFTER the mutation above already reported success (this
  // phase's brief: "Do NOT create a successful fix-history record before
  // the Shopify write succeeded"). verification_status uses this file's own
  // 'admin_write_succeeded' vocabulary rather than WordPress's
  // verified/pending/mismatch language, since no public-page check happens
  // here — that is Phase 20.1G's job. A history persistence failure is
  // reported truthfully via `historyStatus` below, never silently.
  const historyStatus = await recordFixHistory({
    websiteId: payload.websiteId,
    platform: SHOPIFY_PLATFORM,
    issueTitle: trustedIssue.issue.issueTitle,
    pageUrl: trustedIssue.issue.pageUrl,
    resourceType: mapping.resourceType,
    resourceId: null,
    resourceGid: updateResult.gid,
    field: 'meta_description',
    previousValue: currentValue,
    appliedValue: updateResult.value,
    verificationStatus: 'admin_write_succeeded',
  })

  return {
    writeStatus: 'admin_write_succeeded',
    resourceType: mapping.resourceType,
    resourceGid: updateResult.gid,
    field: 'meta_description',
    previousValue: currentValue,
    newValue: updateResult.value,
    pageUrl: trustedIssue.issue.pageUrl,
    historyStatus,
  }
}
