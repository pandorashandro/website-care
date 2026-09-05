import 'server-only'
import { fetchPage } from '@/lib/scanner/checks'
import type { PublicVerificationStatus } from './verification-status'

/**
 * Phase 20.1G — the single, generic public-verification primitive used by
 * every Shopify Title/Meta Description Apply AND Undo flow. Deliberately
 * modeled on the existing WordPress ROLLBACK verifiers
 * (lib/fixes/verify-rollback.ts, lib/fixes/verify-meta-description-rollback.ts,
 * lib/fixes/verify-h1-rollback.ts) rather than the WordPress APPLY verifiers
 * (verify-title-fix.ts, verify-meta-description-fix.ts): those Apply
 * verifiers additionally resolve a WordPress-specific "is the original
 * issue kind resolved" question via the scanner's title/meta length rules,
 * which has no Shopify equivalent — a Shopify Apply already knows the
 * single exact value it wrote and only needs to ask "does the public page
 * show exactly that." The WordPress rollback verifiers already ask exactly
 * that question, with no WordPress-specific logic in their bodies at all
 * (only their doc comments and reason text mention WordPress) — so
 * Shopify's Apply AND Undo both use this shared primitive instead of
 * introducing a fourth near-duplicate per-field-per-operation file.
 *
 * `expectedValue` is the value webioom just confirmed Shopify accepted
 * (the new value on Apply, the restored/previous value on Undo).
 * `valueBeforeThisWrite` is whatever the field held immediately before this
 * specific write (the previous value on Apply, the value being undone on
 * Undo) — used only to distinguish "still serving the old value" (a caching
 * signal, reported as 'pending') from "showing something else entirely" (a
 * real 'mismatch').
 *
 * NORMALIZATION RULE (deliberately conservative, and identical to every
 * existing WordPress verifier): whitespace-collapse + trim only
 * (`value.replace(/\s+/g, ' ').trim()`). No HTML-entity decoding, no
 * case-folding, no truncation-aware fuzzy matching. This is carried
 * forward unchanged from the WordPress precedent rather than "fixed" here
 * — entity-encoding differences (e.g. a literal "&" appearing as "&amp;" in
 * rendered HTML) can already produce a false 'mismatch' for WordPress
 * today, and this phase does not alter that pre-existing, platform-
 * independent behavior (changing it would be a real product decision with
 * its own risk of the opposite failure mode — normalizing two genuinely
 * different values into a false 'verified' — and is out of this phase's
 * scope). A theme that appends something to the rendered value (e.g. a
 * Shopify theme rendering `<title>{{ value }} – {{ shop.name }}</title>`)
 * is intentionally reported as 'mismatch', never coerced toward 'verified'
 * via a substring/contains match — see this phase's brief: "Do not create
 * normalization so aggressive that genuinely different content becomes
 * verified."
 *
 * This function performs exactly one fetch attempt — no retries, no
 * polling — matching every existing WordPress verifier's own documented
 * "single-attempt" behavior. CDN/theme cache propagation delay is not
 * "fixed" by retrying; it is truthfully reported via the 'pending' status
 * instead (see the module doc comment above on why that status exists).
 *
 * SSRF/network safety is entirely delegated to fetchPage — the same
 * hardened helper every scan and every WordPress verifier already uses
 * (SSRF hostname/userinfo guard re-checked on every redirect hop, manual
 * bounded-redirect following with safety re-validated per hop, bounded
 * timeout, HTTP(S)-only). Nothing here duplicates or weakens that.
 */
export type ShopifyPublicVerification =
  | { status: Extract<PublicVerificationStatus, 'verified'>; liveValue: string; reason: string }
  | { status: Extract<PublicVerificationStatus, 'pending'>; liveValue: string | null; reason: string }
  | { status: Extract<PublicVerificationStatus, 'mismatch'>; liveValue: string | null; reason: string }
  | { status: Extract<PublicVerificationStatus, 'unavailable'>; reason: string }

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Detects, with strong platform-level evidence only, that a fetched
 * response is Shopify's own storefront password/access gate rather than
 * the intended resource page — never a guess based on arbitrary page copy
 * (which is theme-customizable and unreliable). Two independent signals,
 * either one sufficient on its own:
 *
 * 1. `finalUrl`'s path is exactly `/password` — Shopify's own reserved,
 *    platform-controlled route: every storefront request to a
 *    password-protected shop is redirected here regardless of theme
 *    (confirmed current Shopify behavior; fetchPage already follows
 *    redirects and reports the final URL after them).
 * 2. The HTML contains an `<input>` whose `name` is `form_type` and whose
 *    `value` is `storefront_password` — the exact hidden field Shopify's
 *    own `{% form 'storefront_password' %}` Liquid tag injects into every
 *    theme's password form. This is Shopify PLATFORM output (part of the
 *    form tag's own rendering, not authored theme copy), so its presence
 *    is strong, specific evidence — not a heuristic over page text.
 *
 * Deliberately does NOT attempt broader headless/JS-shell or generic
 * interstitial detection — those have no comparably strong, structural
 * signal available here, and guessing would violate this phase's explicit
 * "no giant heuristic detector" constraint. A page that fails to match
 * either signal above is treated as a normal, successfully fetched target
 * page, exactly as before this correction.
 */
/** Exported (Phase 21) so this pure, deterministic, security-relevant detector has direct permanent test coverage (tests/shopify-verification.test.ts) without needing to mock fetchPage or perform a live request. Not otherwise called from outside this module. */
export function isShopifyPasswordOrAccessPage(finalUrl: string, html: string): boolean {
  try {
    if (new URL(finalUrl).pathname === '/password') return true
  } catch {
    // Malformed finalUrl is unexpected (fetchPage already parsed it
    // successfully to get here) — fall through to the HTML-based check
    // rather than treating a URL-parse hiccup as proof of anything.
  }

  const inputTags = html.match(/<input\b[^>]*>/gi) ?? []
  return inputTags.some((tag) => /\bname\s*=\s*["']form_type["']/i.test(tag) && /\bvalue\s*=\s*["']storefront_password["']/i.test(tag))
}

export async function verifyShopifyPublicValue(input: {
  pageUrl: string
  expectedValue: string
  valueBeforeThisWrite: string
  /** Extracts the field's rendered value from the page's raw HTML — always one of scanner/checks.ts's own hardened extractors (getTitleText, getMetaDescriptionContent), never a bespoke Shopify-specific parser. */
  extract: (html: string) => string | null
  /** Human-readable field name used only in returned `reason` text, e.g. "title", "meta description". */
  fieldLabel: string
}): Promise<ShopifyPublicVerification> {
  const { pageUrl, expectedValue, valueBeforeThisWrite, extract, fieldLabel } = input

  const fetched = await fetchPage(pageUrl)

  if (!fetched.ok) {
    return { status: 'unavailable', reason: 'The public storefront page could not be checked right now.' }
  }

  if (fetched.finalStatus < 200 || fetched.finalStatus >= 300) {
    return { status: 'unavailable', reason: 'The public storefront page did not return a normal response when checked.' }
  }

  // A password/access-gated response is not the intended resource page at
  // all — its title/meta content (if any) says nothing about whether
  // webioom's write is reflected on the actual page, so this must fail
  // closed as 'unavailable' rather than being compared as if it were the
  // real target (which could otherwise produce a false 'mismatch').
  if (isShopifyPasswordOrAccessPage(fetched.finalUrl, fetched.html)) {
    return {
      status: 'unavailable',
      reason: 'The public storefront returned a password/access page instead of the resource itself, so webioom could not confirm the public value.',
    }
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

  // Only treat this as caching if the live page is still serving the exact
  // value that was live immediately before this write — a page that never
  // had a meaningful value before isn't "still serving the old value."
  if (normalizedBefore.length > 0 && normalizedLive === normalizedBefore) {
    return {
      status: 'pending',
      liveValue: liveValueRaw,
      reason: `Shopify accepted the update, but the public storefront still appears to be showing the previous ${fieldLabel}. This may be caused by caching or CDN propagation delay.`,
    }
  }

  return {
    status: 'mismatch',
    liveValue: liveValueRaw,
    reason: `Shopify accepted the update, but the public storefront is showing a different ${fieldLabel} than expected. This can happen if the store's theme customizes how this field is rendered (for example, appending the shop name).`,
  }
}
