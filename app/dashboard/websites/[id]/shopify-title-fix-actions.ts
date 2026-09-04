'use server'

import { getValidShopifyAccessToken } from './shopify-credentials'
import { getTrustedShopifyTitleIssue } from './shopify-title-issue'
import { resolveShopifyResource, mappingFailureMessage } from '@/lib/integrations/shopify/resource-mapping'
import { getGrantedShopifyScopes } from '@/lib/integrations/shopify/scopes'
import { evaluateShopifyFixCapability, type ShopifyResourceFamily } from '@/lib/integrations/shopify/capabilities'
import {
  generateShopifyTitleProposal,
  validateShopifyTitle,
} from '@/lib/integrations/shopify/title-proposal'
import {
  updateShopifyProductTitle,
  updateShopifyCollectionTitle,
  updateShopifyPageTitle,
  updateShopifyArticleTitle,
  mutationFailureMessage,
  type ShopifyTitleUpdateResult,
} from '@/lib/integrations/shopify/title-mutations'
import { generateShopifyTitleRecommendation } from '@/lib/ai/shopify-title-recommendation'
import { signShopifyTitlePreviewToken, verifyShopifyTitlePreviewToken } from '@/lib/fixes/preview-token'
import { SHOPIFY_PLATFORM } from '@/lib/integrations/shopify/platform'
import { recordFixHistory, type FixHistoryInsertResult } from './fix-history'
import { getTitleText } from '@/lib/scanner/checks'
import { verifyShopifyPublicValue, type ShopifyPublicVerification } from '@/lib/fixes/verify-shopify-public-value'

/**
 * Phase 20.1D — Shopify Safe Title Fix backend foundation. Phase 20.1F adds
 * durable fix_history recording on a successful write, and safe Undo (see
 * shopify-title-rollback-actions.ts, which reuses executeTitleMutation and
 * mappingFailureMessage exported below rather than duplicating the
 * resource-type dispatch or failure-message mapping). Phase 20.1G adds
 * public storefront verification (via lib/fixes/verify-shopify-public-value.ts,
 * shared with Meta Description and with Undo).
 *
 * IMPORTANT SCOPE BOUNDARY: a successful Apply here means the Shopify
 * Admin API confirmed the title field was updated — nothing more. It does
 * NOT mean the public storefront now shows the new title (a headless or
 * custom-themed store may render nothing from this field at all — see
 * lib/integrations/shopify/capabilities.ts's `renderControlProven: false`,
 * which this file never changes to `true`). That is now a SEPARATE,
 * explicit `verification` result on the success state below — never
 * collapsed into `writeStatus`, which stays 'admin_write_succeeded'
 * regardless of what verification finds. No UI trigger exists for this yet
 * — that is Phase 20.1H's job.
 */

// ---------------------------------------------------------------------------
// Prepare
// ---------------------------------------------------------------------------

export type PrepareShopifyTitleFixState =
  | {
      status: 'ready'
      resourceType: ShopifyResourceFamily
      currentTitle: string
      proposedValue: string
      pageUrl: string
      explanation: string
      previewToken: string
    }
  | { status: 'unavailable'; reason: string }
  | null

function pathFromUrl(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

/**
 * Read-only with respect to merchant content. Never writes to Shopify.
 * Starts only from an opaque `issueId` — never a browser-submitted page
 * URL or title — and re-derives everything else server-side: the trusted
 * issue's page URL, a fresh Shopify token, fresh granted scopes, the exact
 * mapped Admin resource, and a fresh Title capability evaluation. Only
 * once all of those independently succeed does it read the current title
 * and generate a proposal.
 */
export async function prepareShopifyTitleFix(
  _prevState: PrepareShopifyTitleFixState,
  formData: FormData
): Promise<PrepareShopifyTitleFixState> {
  const websiteId = formData.get('websiteId') as string | null
  const issueId = formData.get('issueId') as string | null

  if (!websiteId || !issueId) {
    return { status: 'unavailable', reason: 'Missing information for this request.' }
  }

  // Re-verifies webioom session + website ownership, and walks the full
  // issue -> scan -> website ownership chain — never trusts the form's
  // websiteId/issueId as proof on their own.
  const trustedIssue = await getTrustedShopifyTitleIssue(websiteId, issueId)
  if (!trustedIssue.ok) {
    return { status: 'unavailable', reason: trustedIssue.reason }
  }

  // Independently re-verifies webioom session + website ownership AGAIN
  // (a second, independent check against wordpress_connections-equivalent
  // Shopify storage) before ever reading a Shopify connection.
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

  const capability = evaluateShopifyFixCapability('title', { resourceContext: 'resolved', resourceType: mapping.resourceType }, scopesResult)

  if (capability.status !== 'supported') {
    if (capability.status === 'missing_scope') {
      return { status: 'unavailable', reason: 'The connected Shopify store does not currently grant webioom permission to edit this title.' }
    }
    if (capability.status === 'connection_unhealthy') {
      return { status: 'unavailable', reason: 'webioom could not confirm the Shopify connection is currently usable.' }
    }
    return { status: 'unavailable', reason: 'webioom cannot safely prepare this fix right now.' }
  }

  const currentTitle = mapping.title ?? ''
  const pagePath = pathFromUrl(trustedIssue.issue.pageUrl)

  // At most one AI call per Prepare click. AI receives only trusted,
  // already-server-derived identity fields — never credentials, never a
  // GID, never scopes. Falls back internally (never throws) on any
  // provider failure or invalid output.
  const recommendation = await generateShopifyTitleRecommendation({
    currentTitle: mapping.title,
    handle: mapping.handle,
    pagePath,
    websiteName: null,
    resourceType: mapping.resourceType,
    issueKind: trustedIssue.issue.issueKind,
  })

  const proposalOutcome =
    recommendation.status === 'generated'
      ? { ok: true as const, proposedValue: recommendation.proposedTitle, explanation: recommendation.explanation }
      : (() => {
          const deterministic = generateShopifyTitleProposal(trustedIssue.issue.issueKind, {
            currentTitle: mapping.title,
            handle: mapping.handle,
            websiteName: null,
          })
          return deterministic.ok
            ? { ok: true as const, proposedValue: deterministic.proposedValue, explanation: 'webioom generated this title from the page’s existing information.' }
            : { ok: false as const, reason: deterministic.reason }
        })()

  if (!proposalOutcome.ok) {
    return { status: 'unavailable', reason: proposalOutcome.reason }
  }

  const validated = validateShopifyTitle(proposalOutcome.proposedValue)
  if (!validated.ok) {
    return { status: 'unavailable', reason: validated.reason }
  }

  let previewToken: string
  try {
    previewToken = signShopifyTitlePreviewToken({
      issueId,
      websiteId,
      pageUrl: trustedIssue.issue.pageUrl,
      issueTitle: trustedIssue.issue.issueTitle,
      field: 'title',
      resourceType: mapping.resourceType,
      resourceGid: mapping.gid,
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

export type ApplyShopifyTitleFixState =
  | {
      writeStatus: 'admin_write_succeeded'
      resourceType: ShopifyResourceFamily
      resourceGid: string
      previousTitle: string
      newTitle: string
      pageUrl: string
      /**
       * Phase 20.1G: the public storefront verification result — fully
       * independent of `writeStatus`, which stays 'admin_write_succeeded'
       * regardless of what this says. A 'mismatch' or 'unavailable' never
       * downgrades this to a failure, and never triggers a second mutation.
       */
      verification: ShopifyPublicVerification
      /**
       * Phase 20.1F: whether this write was durably recorded to fix_history
       * (and is therefore Undo-eligible). 'failed' here means the Shopify
       * Admin write already succeeded regardless — see this file's Apply
       * doc comment — never that the title change should be treated as not
       * having happened.
       */
      historyStatus: FixHistoryInsertResult
    }
  | { writeStatus: 'already_applied'; resourceType: ShopifyResourceFamily; resourceGid: string; currentTitle: string }
  | { writeStatus: 'failed'; reason: string }
  | null

/**
 * Resource-type dispatch for the title mutation — exported so
 * shopify-title-rollback-actions.ts can restore a title through the exact
 * same constrained, resource-specific writer Apply used, never a generic
 * one.
 */
export async function executeTitleMutation(
  resourceType: ShopifyResourceFamily,
  shopDomain: string,
  accessToken: string,
  gid: string,
  title: string
): Promise<ShopifyTitleUpdateResult> {
  switch (resourceType) {
    case 'product':
      return updateShopifyProductTitle(shopDomain, accessToken, gid, title)
    case 'collection':
      return updateShopifyCollectionTitle(shopDomain, accessToken, gid, title)
    case 'page':
      return updateShopifyPageTitle(shopDomain, accessToken, gid, title)
    case 'article':
      return updateShopifyArticleTitle(shopDomain, accessToken, gid, title)
  }
}

/**
 * Applies a previously-previewed Shopify title fix. This is the only
 * Shopify title write path in the codebase. The browser submits ONLY the
 * opaque previewToken — website, issue, page, resource identity, expected
 * current title, and the approved proposed title are all extracted from
 * the verified, signed token, never trusted as separate plain form fields.
 * Every fact the token carries is independently RE-DERIVED and compared
 * fresh below before any mutation is attempted — the token proves what was
 * approved, never that it is still safe to apply.
 *
 * Reports only `admin_write_succeeded` on success — never `verified` or
 * any language implying the public storefront was confirmed to change.
 * That distinction is deliberate and is Phase 20.1G's responsibility, not
 * this file's.
 */
export async function applyShopifyTitleFix(_prevState: ApplyShopifyTitleFixState, formData: FormData): Promise<ApplyShopifyTitleFixState> {
  const previewToken = formData.get('previewToken') as string | null

  if (!previewToken) {
    return { writeStatus: 'failed', reason: 'Missing information for this request.' }
  }

  const verified = verifyShopifyTitlePreviewToken(previewToken)
  if (!verified.ok) {
    return {
      writeStatus: 'failed',
      reason: verified.reason === 'expired' ? 'This fix preview has expired. Please prepare the fix again.' : 'This fix preview could not be verified. Please prepare the fix again.',
    }
  }

  const { payload } = verified

  // 1 & 3. Re-authenticate and re-walk the full issue -> scan -> website
  // ownership chain fresh — never trusts the token's own websiteId/issueId
  // as proof the current session may act on them.
  const trustedIssue = await getTrustedShopifyTitleIssue(payload.websiteId, payload.issueId)
  if (!trustedIssue.ok) {
    return { writeStatus: 'failed', reason: trustedIssue.reason }
  }

  if (trustedIssue.issue.pageUrl !== payload.pageUrl || trustedIssue.issue.issueTitle !== payload.issueTitle) {
    return { writeStatus: 'failed', reason: 'This fix preview is no longer valid. Please prepare the fix again.' }
  }

  // Proposal integrity: re-run deterministic validation on the approved
  // value before ever writing it. Never re-generated (no AI call here).
  const revalidated = validateShopifyTitle(payload.proposedValue)
  if (!revalidated.ok) {
    return { writeStatus: 'failed', reason: 'This fix preview is no longer valid. Please prepare the fix again.' }
  }

  // 2 & 5. Independently re-verifies ownership again and obtains a
  // currently-valid token — never reused from Prepare.
  const tokenResult = await getValidShopifyAccessToken(payload.websiteId)
  if (!tokenResult.ok) {
    return { writeStatus: 'failed', reason: 'Shopify is not connected (or the connection needs attention) for this website.' }
  }
  const { myshopifyDomain, accessToken } = tokenResult

  // 6. Fresh scope truth — never the stored/cached value.
  const scopesResult = await getGrantedShopifyScopes(myshopifyDomain, accessToken)

  // 7. Fresh resource re-resolution — never reuses anything from Prepare
  // except for the comparison below.
  const mapping = await resolveShopifyResource(myshopifyDomain, accessToken, trustedIssue.issue.pageUrl)
  if (!mapping.ok) {
    return { writeStatus: 'failed', reason: mappingFailureMessage(mapping) }
  }

  // 8. Identity confirmation: the freshly-resolved resource must be the
  // EXACT same resource the preview was approved for — never a different
  // resource that happens to occupy the same URL now.
  if (mapping.resourceType !== payload.resourceType || mapping.gid !== payload.resourceGid) {
    return { writeStatus: 'failed', reason: 'This fix no longer matches the current Shopify resource and cannot be applied safely.' }
  }

  // 9. Capability re-evaluated fresh — a scope revoked between Prepare and
  // Apply is caught here, never assumed still granted.
  const capability = evaluateShopifyFixCapability('title', { resourceContext: 'resolved', resourceType: mapping.resourceType }, scopesResult)
  if (capability.status !== 'supported') {
    return { writeStatus: 'failed', reason: 'webioom could not confirm permission to apply this update. Please prepare the fix again.' }
  }

  // 10 & 11. Drift check: the current Admin title must still EXACTLY equal
  // what Prepare observed. Exact comparison, never whitespace-normalized —
  // per this phase's explicit instruction, since Shopify's title field has
  // no equivalent to WordPress's save-pipeline reformatting that would
  // justify normalization.
  const currentTitle = mapping.title ?? ''

  if (currentTitle !== payload.expectedCurrentTitle) {
    // 23. Idempotency: if the current title already equals what would be
    // written, this fix was already applied (e.g. a duplicate Apply
    // submission) — report that rather than writing again or reporting
    // generic drift.
    if (currentTitle === revalidated.value) {
      return { writeStatus: 'already_applied', resourceType: mapping.resourceType, resourceGid: mapping.gid, currentTitle }
    }
    return { writeStatus: 'failed', reason: 'This page has changed in Shopify since the fix was prepared. Please prepare the fix again.' }
  }

  // 14. Exactly one, field-specific, already-response-validated mutation.
  const updateResult = await executeTitleMutation(mapping.resourceType, myshopifyDomain, accessToken, mapping.gid, revalidated.value)

  if (updateResult.status !== 'success') {
    return { writeStatus: 'failed', reason: mutationFailureMessage(updateResult.reason) }
  }

  // Phase 20.1G: exactly one, read-only, single-attempt public storefront
  // check — performed only AFTER the Admin mutation above already reported
  // success, and its result never feeds back into another mutation or
  // rollback. Uses the SAME page URL Apply already proved (moments earlier,
  // in this same request, via resolveShopifyResource's domain/identity
  // checks) corresponds to this exact resource — never a client-supplied
  // URL, never a guess for headless/uncertain cases.
  const verification = await verifyShopifyPublicValue({
    pageUrl: trustedIssue.issue.pageUrl,
    expectedValue: updateResult.title,
    valueBeforeThisWrite: currentTitle,
    extract: getTitleText,
    fieldLabel: 'title',
  })

  // Recorded only AFTER the mutation above already reported success — never
  // before (see this phase's brief: "Do NOT create a successful fix-history
  // record before the Shopify write succeeded"). verification_status now
  // stores the REAL public-verification outcome (verified/pending/mismatch/
  // unavailable) — never a placeholder implying the Admin response alone
  // proved public rendering. A history persistence failure is reported
  // truthfully via `historyStatus` below, never silently, and never implies
  // the Shopify write (or the verification attempt) itself failed.
  const historyStatus = await recordFixHistory({
    websiteId: payload.websiteId,
    platform: SHOPIFY_PLATFORM,
    issueTitle: trustedIssue.issue.issueTitle,
    pageUrl: trustedIssue.issue.pageUrl,
    resourceType: mapping.resourceType,
    resourceId: null,
    resourceGid: updateResult.gid,
    field: 'title',
    previousValue: currentTitle,
    appliedValue: updateResult.title,
    verificationStatus: verification.status,
  })

  return {
    writeStatus: 'admin_write_succeeded',
    resourceType: mapping.resourceType,
    resourceGid: updateResult.gid,
    previousTitle: currentTitle,
    newTitle: updateResult.title,
    pageUrl: trustedIssue.issue.pageUrl,
    verification,
    historyStatus,
  }
}
