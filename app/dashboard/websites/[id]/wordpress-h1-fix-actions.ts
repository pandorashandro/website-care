'use server'

import { revalidatePath } from 'next/cache'
import {
  wordpressResources,
  wordpressCapabilities,
  wordpressH1Source,
  wordpressWriters,
} from '@/lib/integrations/wordpress/adapter'
import { buildContentWithInsertedH1 } from '@/lib/fixes/h1-content-transform'
import { verifyH1Fix, type H1FixVerification } from '@/lib/fixes/verify-h1-fix'
import { verifyH1PreviewToken, hashContent } from '@/lib/fixes/preview-token'
import { validateAiH1 } from '@/lib/ai/h1-recommendation'
import { getH1IssueKind } from '@/lib/fixes/fix-preview'
import { getH1Texts } from '@/lib/scanner/checks'
import { getConnectedWordPressCredentials } from './wordpress-credentials'
import { recordFixHistory } from './fix-history'

export type ApplyH1FixState =
  | {
      writeStatus: 'success'
      appliedH1: string
      verification: H1FixVerification
      historyStatus: 'saved' | 'failed'
    }
  | { writeStatus: 'failed'; reason: string }
  | null

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Applies a previously-previewed missing-H1 fix to WordPress. This is the
 * only H1 write path in the codebase, and it only ever writes ONLY
 * missing_h1 on a Gutenberg/Classic HTML source — never multiple_h1, never
 * a builder/custom/ambiguous source, never any field other than `content`.
 *
 * The browser submits ONLY the opaque previewToken. Every fact needed for
 * the write — website, page, expected source, expected H1 counts, the
 * exact content fingerprint, and the approved H1 text — comes from the
 * verified, signed h1-v1 token, never from separate plain form fields.
 * Nothing about the write target is trusted from the token alone: the
 * resource is freshly re-mapped/reloaded, H1 source detection is re-run
 * fresh (source must still match, and both public and editable H1 counts
 * must still be exactly 0), the content.raw fingerprint must exactly match
 * what Prepare Fix hashed, and capabilities are re-checked. No AI call
 * happens here — the approved text is only re-validated deterministically.
 */
export async function applyH1Fix(_prevState: ApplyH1FixState, formData: FormData): Promise<ApplyH1FixState> {
  const previewToken = formData.get('previewToken') as string | null

  if (!previewToken) {
    return { writeStatus: 'failed', reason: 'Missing information for this request.' }
  }

  const verified = verifyH1PreviewToken(previewToken)

  if (!verified.ok) {
    return {
      writeStatus: 'failed',
      reason:
        verified.reason === 'expired'
          ? 'This fix preview has expired. Please prepare the fix again.'
          : 'This fix preview could not be verified. Please prepare the fix again.',
    }
  }

  const { websiteId, pageUrl, issueTitle, expectedSource, expectedH1Count, expectedContentHash, proposedValue } =
    verified.payload

  // Only missing_h1 may ever reach a write — re-checked independently of
  // whatever the signed token claims.
  const issueKind = getH1IssueKind(issueTitle)
  if (issueKind !== 'missing_h1') {
    return { writeStatus: 'failed', reason: 'This fix type is not supported.' }
  }

  // Proposal integrity: re-run deterministic validation on the approved
  // value before ever writing it. Never re-generated (no AI call).
  const revalidatedH1 = validateAiH1(proposedValue)
  if (!revalidatedH1) {
    return { writeStatus: 'failed', reason: 'This fix preview is no longer valid. Please prepare the fix again.' }
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

  // Fresh H1 source detection — must still be supported, on missing_h1,
  // with the exact same source and H1 counts (0/0) the preview was based
  // on. Any drift aborts rather than risk writing something the user never
  // actually saw confirmed.
  const sourceResult = await wordpressH1Source.detect({ pageUrl: content.permalink, issueKind: 'missing_h1', content })

  if (sourceResult.status !== 'supported') {
    return {
      writeStatus: 'failed',
      reason: 'This heading can no longer be safely added. Please prepare the fix again.',
    }
  }

  if (sourceResult.source !== expectedSource) {
    return {
      writeStatus: 'failed',
      reason: 'The content format for this page has changed since the fix was prepared. Please prepare the fix again.',
    }
  }

  if (
    sourceResult.publicH1s.length !== 0 ||
    sourceResult.editableH1s.length !== 0 ||
    expectedH1Count !== 0 ||
    sourceResult.editableH1s.length !== expectedH1Count
  ) {
    return {
      writeStatus: 'failed',
      reason: 'This page already has a heading now. Please prepare the fix again.',
    }
  }

  // Content-hash stale protection: H1 count staying at 0 isn't enough — the
  // page body could have changed in an unrelated way since the preview.
  const currentContentHash = hashContent(content.content ?? '')
  if (currentContentHash !== expectedContentHash) {
    return {
      writeStatus: 'failed',
      reason: 'The WordPress page content changed since this preview was prepared. Please prepare the fix again.',
    }
  }

  // Capability gating is resource-type-specific — a page requires
  // canEditPages, a post requires canEditPosts. 'unavailable' and
  // 'unknown' both fail closed; only 'available' permits a write.
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

  const transform = buildContentWithInsertedH1({
    source: sourceResult.source,
    rawContent: content.content as string,
    proposedH1: revalidatedH1,
  })

  if (transform.status !== 'ready') {
    return { writeStatus: 'failed', reason: transform.reason }
  }

  const restBase = content.resourceType === 'page' ? 'pages' : 'posts'

  const updateResult = await wordpressWriters.h1Content({
    websiteUrl: credentials.websiteUrl,
    restBase,
    resourceId: content.resourceId,
    expectedPermalink: content.permalink,
    updatedContent: transform.updatedContent,
    username: credentials.username,
    applicationPassword: credentials.applicationPassword,
  })

  if (updateResult.status !== 'success') {
    return { writeStatus: 'failed', reason: updateResult.reason }
  }

  // Response validation: confirm the returned content.raw actually shows
  // exactly one H1 matching the approved text. Full-content byte equality
  // isn't required (WordPress's save pipeline may legitimately reformat
  // markup) — see write-h1-content.ts for the reasoning.
  const returnedH1s = getH1Texts(updateResult.contentRaw)
  const normalizedApplied = normalizeForComparison(revalidatedH1)
  const confirmedInResponse = returnedH1s.length === 1 && normalizeForComparison(returnedH1s[0]) === normalizedApplied

  if (!confirmedInResponse) {
    return {
      writeStatus: 'failed',
      reason: "WordPress's response did not confirm the heading was added.",
    }
  }

  // Exactly one targeted public verification attempt — no retries, no
  // polling. Fetches the PUBLIC page only, never carries any credential.
  const verification = await verifyH1Fix({ pageUrl: content.permalink, expectedH1: revalidatedH1 })

  // Recorded regardless of verification outcome. websiteId is already
  // ownership-verified above; every other value here is server-derived.
  const historyStatus = await recordFixHistory({
    websiteId,
    issueTitle,
    pageUrl: content.permalink,
    resourceType: content.resourceType,
    resourceId: content.resourceId,
    field: 'h1',
    previousValue: '',
    appliedValue: revalidatedH1,
    verificationStatus: verification.status,
  })

  revalidatePath(`/dashboard/websites/${websiteId}`)

  return { writeStatus: 'success', appliedH1: revalidatedH1, verification, historyStatus }
}
