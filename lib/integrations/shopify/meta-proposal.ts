import 'server-only'
import { stripToPlainText } from '@/lib/fixes/title-preview'

/**
 * Structurally identical to lib/fixes/title-preview.ts's TitleIssueKind and
 * lib/ai/meta-description-recommendation.ts's MetaDescriptionIssueKind, but
 * deliberately declared as its own independent type rather than aliased
 * from either — matching the established precedent that Title and Meta
 * Description keep separate issue-kind types even though both happen to be
 * a length classification with the same three values.
 */
export type ShopifyMetaDescriptionIssueKind = 'missing' | 'too_short' | 'too_long'

/**
 * webioom's own SEO-convention policy maximum — NOT a Shopify-imposed
 * limit. Shopify documents no length cap on Product/Collection.seo.description
 * or the global.description_tag metafield. Matches
 * lib/scanner/meta-description-rules.ts's identical META_DESCRIPTION_MAX_LENGTH
 * exactly, for cross-platform product consistency — not because Shopify
 * requires it.
 */
const WEBIOOM_META_DESCRIPTION_MAX_LENGTH = 160

export type ShopifyMetaDescriptionValidationResult = { ok: true; value: string } | { ok: false; reason: string }

/**
 * Validates a candidate Shopify meta description — from AI only; there is
 * NO deterministic fallback generator for meta descriptions, exactly
 * mirroring lib/ai/meta-description-recommendation.ts's own established
 * precedent for WordPress (fabricating summary-shaped marketing copy from
 * a bare handle/title, with no real content to draw from, is exactly the
 * kind of unsupported claim webioom's AI safety rules forbid — see that
 * module's own doc comment). If AI cannot produce a safe result, Prepare
 * simply reports unavailable; nothing here invents a description.
 */
export function validateShopifyMetaDescription(raw: string): ShopifyMetaDescriptionValidationResult {
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
      reason: `webioom limits meta descriptions to ${WEBIOOM_META_DESCRIPTION_MAX_LENGTH} characters (webioom policy, not a Shopify limit).`,
    }
  }

  return { ok: true, value }
}
