'use server'

import { revalidatePath } from 'next/cache'
import {
  wordpressResources,
  wordpressCapabilities,
  wordpressMetadataProvider,
  wordpressWriters,
} from '@/lib/integrations/wordpress/adapter'
import { verifyMetaDescriptionFix, type MetaDescriptionFixVerification } from '@/lib/fixes/verify-meta-description-fix'
import { verifyMetaDescriptionPreviewToken } from '@/lib/fixes/preview-token'
import { validateAiMetaDescription } from '@/lib/ai/meta-description-recommendation'
import { getMetaDescriptionIssueKind } from '@/lib/fixes/fix-preview'
import { getConnectedWordPressCredentials } from './wordpress-credentials'
import { recordFixHistory } from './fix-history'

export type ApplyMetaDescriptionFixState =
  | {
      writeStatus: 'success'
      appliedMetaDescription: string
      verification: MetaDescriptionFixVerification
      historyStatus: 'saved' | 'failed'
    }
  | { writeStatus: 'failed'; reason: string }
  | null

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Applies a previously-previewed meta-description fix to WordPress, for
 * Yoast or Rank Math only. The browser submits ONLY the opaque
 * previewToken (a meta-v1 signed token, structurally distinct from the
 * title token — see preview-token.ts) — website, page, issue, provider,
 * write field, expected current value, and the approved proposed value are
 * all extracted from the verified, signed payload, never trusted as
 * separate plain form fields.
 *
 * Nothing about the write target is trusted from the token alone: the
 * resource is freshly re-mapped and reloaded, the SEO provider is freshly
 * re-detected (and must match both the token's provider AND its write
 * field), capabilities are re-checked, and the current provider-backed
 * meta description must still exactly match what the preview was based on.
 * Only after all of that does the exact approved value (re-validated
 * deterministically, never re-generated — no AI call happens here) get
 * written, using the same constrained provider-aware writer for both
 * providers. No generic WordPress meta writer exists anywhere.
 */
export async function applyMetaDescriptionFix(
  _prevState: ApplyMetaDescriptionFixState,
  formData: FormData
): Promise<ApplyMetaDescriptionFixState> {
  const previewToken = formData.get('previewToken') as string | null

  if (!previewToken) {
    return { writeStatus: 'failed', reason: 'Missing information for this request.' }
  }

  const verified = verifyMetaDescriptionPreviewToken(previewToken)

  if (!verified.ok) {
    return {
      writeStatus: 'failed',
      reason:
        verified.reason === 'expired'
          ? 'This fix preview has expired. Please prepare the fix again.'
          : 'This fix preview could not be verified. Please prepare the fix again.',
    }
  }

  const {
    websiteId,
    pageUrl,
    issueTitle,
    provider: tokenProvider,
    writeField: tokenWriteField,
    expectedCurrentValue,
    proposedValue,
  } = verified.payload

  const issueKind = getMetaDescriptionIssueKind(issueTitle)
  if (!issueKind) {
    return { writeStatus: 'failed', reason: 'This fix type is not supported.' }
  }

  // Proposal integrity: re-run deterministic validation on the approved
  // value before ever writing it. Never re-generated (no AI call), never
  // taken from anywhere else — this only ever narrows/normalizes the exact
  // value the token already carries.
  const revalidatedValue = validateAiMetaDescription(proposedValue)
  if (!revalidatedValue) {
    return {
      writeStatus: 'failed',
      reason: 'This fix preview is no longer valid. Please prepare the fix again.',
    }
  }

  // Re-verifies webioom session + website ownership internally before
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
  // earlier Prepare Fix call.
  const content = await wordpressResources.loadEditable(
    credentials.websiteUrl,
    pageUrl,
    credentials.username,
    credentials.applicationPassword
  )

  if (content.status !== 'loaded') {
    return { writeStatus: 'failed', reason: content.reason }
  }

  // Fresh provider re-detection — required to still match what was
  // previewed and approved. A provider that changed since the preview (or
  // is no longer writable) aborts rather than writing to a different field
  // than the user actually saw.
  const providerResult = await wordpressMetadataProvider.detect(
    credentials.websiteUrl,
    content,
    credentials.username,
    credentials.applicationPassword
  )

  if (providerResult.status !== 'detected' || !providerResult.writable || !providerResult.writeStrategy) {
    return {
      writeStatus: 'failed',
      reason: 'This meta description can no longer be safely updated. Please prepare the fix again.',
    }
  }

  if (providerResult.provider !== tokenProvider) {
    return {
      writeStatus: 'failed',
      reason: 'The SEO provider for this page has changed since the fix was prepared. Please prepare the fix again.',
    }
  }

  if (providerResult.writeStrategy.type !== 'resource_meta' || providerResult.writeStrategy.field !== tokenWriteField) {
    return {
      writeStatus: 'failed',
      reason: 'This fix preview is no longer valid. Please prepare the fix again.',
    }
  }

  // providerResult.provider is now confirmed to be exactly 'yoast' or
  // 'rank_math' (the only values SeoMetadataProviderResult's 'detected'
  // status can carry alongside writable:true via this codebase's own
  // detection logic — 'aioseo' never reaches here).
  const provider = providerResult.provider as 'yoast' | 'rank_math'

  // Capability gating is resource-type-specific — a page requires
  // canEditPages, a post requires canEditPosts. 'unavailable' and
  // 'unknown' both fail closed; only 'available' permits a write. Never
  // relies solely on providerResult.writable for permission.
  const capabilityResult = await wordpressCapabilities.check(
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

  // Stale-preview protection: compare the freshly re-detected current meta
  // description against the token's expected current value. Whitespace is
  // normalized; any other difference aborts.
  const currentValueNormalized = normalizeForComparison(providerResult.currentMetaDescription ?? '')
  const expectedNormalized = normalizeForComparison(expectedCurrentValue)

  if (currentValueNormalized !== expectedNormalized) {
    return {
      writeStatus: 'failed',
      reason: 'The meta description changed since this preview was prepared. Please prepare the fix again.',
    }
  }

  const restBase = content.resourceType === 'page' ? 'pages' : 'posts'

  const updateResult = await wordpressWriters.metaDescription({
    websiteUrl: credentials.websiteUrl,
    restBase,
    resourceId: content.resourceId,
    expectedPermalink: content.permalink,
    provider,
    metaDescription: revalidatedValue,
    username: credentials.username,
    applicationPassword: credentials.applicationPassword,
  })

  if (updateResult.status !== 'success') {
    return { writeStatus: 'failed', reason: updateResult.reason }
  }

  // Exactly one targeted public verification attempt — no retries, no
  // polling. Fetches the PUBLIC page only, never carries any credential.
  const verification = await verifyMetaDescriptionFix({
    pageUrl: content.permalink,
    originalIssueKind: issueKind,
    expectedAppliedDescription: updateResult.metaDescription,
    previousValue: providerResult.currentMetaDescription,
  })

  // Recorded regardless of verification outcome. websiteId is already
  // ownership-verified above; every other value here is server-derived.
  // Phase 19.5B-S: writeStrategy records the exact SEO-provider mechanism
  // this write actually used — derived from `provider`, the same
  // freshly-revalidated value passed to the writer above, never from the
  // token or any client input — so a future Undo can prove it is reversing
  // through the same mechanism, not merely a currently-matching value.
  const historyStatus = await recordFixHistory({
    websiteId,
    issueTitle,
    pageUrl: content.permalink,
    resourceType: content.resourceType,
    resourceId: content.resourceId,
    field: 'meta_description',
    writeStrategy: wordpressMetadataProvider.toWriteStrategy(provider),
    previousValue: providerResult.currentMetaDescription,
    appliedValue: updateResult.metaDescription,
    verificationStatus: verification.status,
  })

  revalidatePath(`/dashboard/websites/${websiteId}`)

  return {
    writeStatus: 'success',
    appliedMetaDescription: updateResult.metaDescription,
    verification,
    historyStatus,
  }
}
