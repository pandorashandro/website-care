import 'server-only'
import type { WixResourceFamily } from './resource-mapping'

/**
 * Exactly the two fix families current, evidenced Wix APIs support at all
 * — see docs/wix-api-research.md §7. H1 and Image Alt are deliberately NOT
 * members of this type, mirroring lib/integrations/shopify/capabilities.ts's
 * treatment of H1: there is no confirmed API surface for either, so the
 * type system itself prevents any caller from asking this module about
 * them, rather than the module having to reject them at runtime.
 */
export type WixFixFamily = 'title' | 'meta_description'

/**
 * What the caller already knows about the resource before asking for a
 * capability decision — always derived from a server-confirmed
 * resource-mapping.ts result, never client-supplied.
 */
export type WixFixCapabilityContext = { resourceType: WixResourceFamily; isPrimaryLanguage: boolean }

/**
 * Every reachable outcome of evaluateWixFixCapability. Unlike Shopify's
 * evaluateShopifyFixCapability, there is no `missing_scope` variant here:
 * Wix's permission model is a single, app-wide, dashboard-declared set
 * (see docs/wix-api-research.md §8) with no confirmed live
 * scopes-introspection call analogous to Shopify's
 * getGrantedShopifyScopes, so a missing permission cannot currently be
 * distinguished, ahead of time, from any other API rejection — it will
 * surface as a `permission_denied` API response at Prepare/Apply time
 * instead (Prompt 2's job), the same fail-closed-on-rejection posture
 * WordPress's REST calls already use.
 *
 * `language_not_supported` exists because the Item SEO Tags API can only
 * write tags for a site's primary language (confirmed from its schema —
 * see docs/wix-api-research.md §6/§7); a resource in a non-primary
 * language must fail closed here rather than attempt a write Wix would
 * reject with `LANGUAGE_NOT_SUPPORTED`.
 */
export type WixFixCapability =
  | { status: 'supported'; fixFamily: WixFixFamily; resourceType: WixResourceFamily }
  | { status: 'language_not_supported'; fixFamily: WixFixFamily; resourceType: WixResourceFamily }

/**
 * The single entry point for "can webioom safely fix `fixFamily` for this
 * resource, right now, for this connected Wix site." Pure and
 * deterministic given its inputs — no network calls of its own, mirroring
 * evaluateShopifyFixCapability's own contract exactly.
 *
 * Both `blog_post` and `stores_product` support both fix families
 * identically (the Item SEO Tags API's `title`/`meta` tag types apply the
 * same way to either item type — see docs/wix-api-research.md §7), so
 * there is no per-(fixFamily, resourceType) policy table the way
 * Shopify's Image Alt required one — every resourceType this function can
 * even be asked about (WixResourceFamily itself already excludes
 * STATIC_PAGE — see resource-mapping.ts) supports both fix families.
 */
export function evaluateWixFixCapability(fixFamily: WixFixFamily, context: WixFixCapabilityContext): WixFixCapability {
  if (!context.isPrimaryLanguage) {
    return { status: 'language_not_supported', fixFamily, resourceType: context.resourceType }
  }

  return { status: 'supported', fixFamily, resourceType: context.resourceType }
}

/**
 * Lives here (not in a 'use server' action file) for the same reason
 * mappingFailureMessage lives in resource-mapping.ts — a plain synchronous
 * formatter must never be exported from a 'use server' file, which Next.js
 * requires to export only async Server Actions.
 */
export function capabilityFailureMessage(capability: WixFixCapability): string {
  if (capability.status === 'language_not_supported') {
    return 'This resource is not in your Wix site’s primary language, which webioom cannot currently edit safely.'
  }
  return 'webioom cannot safely prepare this fix right now.'
}
