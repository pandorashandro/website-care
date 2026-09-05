import 'server-only'
import { fetchPage } from '@/lib/scanner/checks'
import type { PublicVerificationStatus } from './verification-status'

/**
 * Wix V1 Prompt 2 — the public-verification primitive for Wix Title/Meta
 * Description Apply AND Undo, mirroring
 * lib/fixes/verify-shopify-public-value.ts's structure and safety
 * properties exactly (same fetchPage-based fetch, same
 * verified/pending/mismatch/unavailable outcome model built from the
 * shared PublicVerificationStatus vocabulary, same single-attempt/
 * read-only/no-retry policy, same "never treat the Admin write as public
 * confirmation" philosophy — directly required by Wix's own docs, which
 * state Set Item SEO Tags' response "isn't a read of the published
 * revision... don't treat it as confirmation that the live page changed").
 *
 * Deliberately does NOT include a Wix-specific access-gate/interstitial
 * detector the way verify-shopify-public-value.ts's
 * isShopifyPasswordOrAccessPage does for Shopify's storefront password
 * page. Wix does have a comparable "Site Password" feature for
 * pre-launch/private sites, but this phase has not researched its exact,
 * platform-controlled HTML markers with the same confidence Shopify's
 * `/password` path + `storefront_password` form field were confirmed
 * with — inventing a heuristic without that evidence would violate this
 * phase's explicit "do not create broad fuzzy heuristics" instruction. A
 * password-gated Wix site will most likely surface as 'mismatch' or
 * 'unavailable' here today (the gate page's own title/meta won't match
 * the expected value), which is safe (never falsely 'verified') but not
 * as precisely labeled as Shopify's equivalent — a known, documented gap,
 * not a silent one.
 */
export type WixPublicVerification =
  | { status: Extract<PublicVerificationStatus, 'verified'>; liveValue: string; reason: string }
  | { status: Extract<PublicVerificationStatus, 'pending'>; liveValue: string | null; reason: string }
  | { status: Extract<PublicVerificationStatus, 'mismatch'>; liveValue: string | null; reason: string }
  | { status: Extract<PublicVerificationStatus, 'unavailable'>; reason: string }

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export async function verifyWixPublicValue(input: {
  pageUrl: string
  expectedValue: string
  valueBeforeThisWrite: string
  /** Always one of scanner/checks.ts's own hardened extractors (getTitleText, getMetaDescriptionContent) — never a bespoke Wix-specific parser. */
  extract: (html: string) => string | null
  fieldLabel: string
}): Promise<WixPublicVerification> {
  const { pageUrl, expectedValue, valueBeforeThisWrite, extract, fieldLabel } = input

  const fetched = await fetchPage(pageUrl)

  if (!fetched.ok) {
    return { status: 'unavailable', reason: 'The public storefront page could not be checked right now.' }
  }

  if (fetched.finalStatus < 200 || fetched.finalStatus >= 300) {
    return { status: 'unavailable', reason: 'The public storefront page did not return a normal response when checked.' }
  }

  const liveValueRaw = extract(fetched.html)
  const normalizedLive = liveValueRaw !== null ? normalizeForComparison(liveValueRaw) : ''
  const normalizedExpected = normalizeForComparison(expectedValue)
  const normalizedBefore = normalizeForComparison(valueBeforeThisWrite)

  if (normalizedLive === normalizedExpected) {
    return {
      status: 'verified',
      liveValue: liveValueRaw ?? '',
      reason: `The public storefront now reflects the ${fieldLabel} webioom wrote.`,
    }
  }

  if (normalizedBefore.length > 0 && normalizedLive === normalizedBefore) {
    return {
      status: 'pending',
      liveValue: liveValueRaw,
      reason: `Wix accepted the update, but the public storefront still appears to be showing the previous ${fieldLabel}. This may be caused by caching or CDN propagation delay.`,
    }
  }

  return {
    status: 'mismatch',
    liveValue: liveValueRaw,
    reason: `Wix accepted the update, but the public storefront is showing a different ${fieldLabel} than expected. This can happen if the site's theme customizes how this field is rendered.`,
  }
}
