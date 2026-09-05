import 'server-only'
import { stripToPlainText } from '@/lib/fixes/title-preview'

/**
 * Structurally identical to lib/integrations/shopify/meta-proposal.ts's
 * ShopifyMetaDescriptionIssueKind — deliberately its own independent type
 * rather than aliased, matching established precedent.
 */
export type WixMetaDescriptionIssueKind = 'missing' | 'too_short' | 'too_long'

/**
 * webioom's own SEO-convention policy maximum — NOT a Wix-imposed limit.
 * The Item SEO Tags API documents no length cap on a `meta` tag's
 * `content` value beyond the item's overall 100-tag/size limit. Matches
 * lib/integrations/shopify/meta-proposal.ts's identical
 * WEBIOOM_META_DESCRIPTION_MAX_LENGTH exactly.
 */
const WEBIOOM_META_DESCRIPTION_MAX_LENGTH = 160

export type WixMetaDescriptionValidationResult = { ok: true; value: string } | { ok: false; reason: string }

/**
 * Validates a candidate Wix meta description — from AI only; there is NO
 * deterministic fallback generator, exactly mirroring
 * lib/integrations/shopify/meta-proposal.ts's own established precedent
 * (fabricating summary-shaped marketing copy from a bare slug/title, with
 * no real content to draw from, is exactly the kind of unsupported claim
 * webioom's AI safety rules forbid). If AI cannot produce a safe result,
 * Prepare simply reports unavailable; nothing here invents a description.
 */
export function validateWixMetaDescription(raw: string): WixMetaDescriptionValidationResult {
  if (/[<>]/.test(raw)) {
    return { ok: false, reason: 'The proposed meta description could not be safely validated.' }
  }

  const value = stripToPlainText(raw)

  if (!value) {
    return { ok: false, reason: 'The proposed meta description is empty.' }
  }

  if (value.length > WEBIOOM_META_DESCRIPTION_MAX_LENGTH) {
    return {
      ok: false,
      reason: `webioom limits meta descriptions to ${WEBIOOM_META_DESCRIPTION_MAX_LENGTH} characters (webioom policy, not a Wix limit).`,
    }
  }

  return { ok: true, value }
}
