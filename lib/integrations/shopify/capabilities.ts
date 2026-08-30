import 'server-only'
import type { ShopifyGrantedScope, ShopifyGrantedScopeSet, ShopifyGrantedScopesResult } from './scopes'
import { missingScopes } from './scopes'

/**
 * Mirrors lib/integrations/shopify/resource-mapping.ts's `resourceType`
 * values exactly (product/collection/page/article — the same four
 * families 20.1B resolves). Declared independently here rather than
 * imported, so this phase makes zero changes to the already-approved,
 * committed 20.1B files — the two unions are structurally identical by
 * construction and will need to be kept in sync if either ever changes.
 */
export type ShopifyResourceFamily = 'product' | 'collection' | 'page' | 'article'

/**
 * Exactly the three fix families Shopify capability is ever evaluated
 * for. H1 is deliberately NOT a member of this type — not merely
 * "always unsupported at runtime," but unrepresentable: Shopify H1 output
 * is theme/render-mediated (see the Phase 20.1 research report), so there
 * is no Shopify-direct-fix policy for it at all, ever, and the type system
 * itself prevents any caller from asking this module about it.
 */
export type ShopifyFixFamily = 'title' | 'meta_description' | 'image_alt'

/**
 * What the caller already knows about the resource/context before asking
 * for a capability decision — always derived from
 * resource-mapping.ts's ShopifyResourceMapping, never from anything
 * client-supplied. 'localized_unsupported' corresponds to 20.1B's
 * `localized_route_unsupported` mapping failure — the one resource-mapping
 * outcome this phase's brief explicitly wants reflected as a capability
 * concept in its own right (see localized_context_unsupported below).
 * Every OTHER resource-mapping failure (invalid_url, unsupported_route,
 * homepage_unsupported, resource_not_found, ambiguous_resource,
 * domain_mismatch, connection_error, malformed_response) is not a
 * "capability" question at all — 20.1B already gives the caller a
 * complete, correct answer for those directly, so callers should report
 * them as-is rather than routing them through this module.
 */
export type ShopifyFixCapabilityContext = { resourceContext: 'resolved'; resourceType: ShopifyResourceFamily } | { resourceContext: 'localized_unsupported' }

/**
 * Per (fixFamily, resourceType) cell: either the exact scopes required for
 * a Safe Fix, or 'unsupported_resource' when webioom policy does not
 * support this combination at all, independent of scope.
 *
 * Derived from this phase's fresh Shopify docs research:
 * - Title/Meta Description: Product & Collection share read_products/
 *   write_products (Shopify scopes Collection under the products family —
 *   there is no separate collections scope); Page & Article share
 *   read_content/write_content. Both are currently granted (Phase 20.1A).
 * - Image Alt: restricted to Product only (per this phase's brief), using
 *   read_files/write_files — the scope the CURRENT, non-deprecated
 *   fileUpdate mutation requires (productUpdateMedia, which used
 *   write_products instead, is deprecated — see the Phase 20.1
 *   correction). NOT currently granted (Phase 20.1A never requested
 *   read_files/write_files), so this combination will correctly evaluate
 *   to 'missing_scope' today — modeling a genuine future capability
 *   without implementing or requesting it yet, exactly as this phase asks.
 *   Collection/Page/Article Image Alt is 'unsupported_resource' — this
 *   phase's brief explicitly forbids claiming image-alt capability outside
 *   Product.
 */
const FIX_FAMILY_RESOURCE_POLICY: Record<ShopifyFixFamily, Record<ShopifyResourceFamily, readonly ShopifyGrantedScope[] | 'unsupported_resource'>> = {
  title: {
    product: ['read_products', 'write_products'],
    collection: ['read_products', 'write_products'],
    page: ['read_content', 'write_content'],
    article: ['read_content', 'write_content'],
  },
  meta_description: {
    product: ['read_products', 'write_products'],
    collection: ['read_products', 'write_products'],
    page: ['read_content', 'write_content'],
    article: ['read_content', 'write_content'],
  },
  image_alt: {
    product: ['read_files', 'write_files'],
    collection: 'unsupported_resource',
    page: 'unsupported_resource',
    article: 'unsupported_resource',
  },
}

/**
 * Every reachable outcome of evaluateShopifyFixCapability — no variant
 * here is a placeholder for a state this module cannot actually produce
 * (see the module doc comment on 'guided_only' and
 * 'headless_or_render_control_unproven', both considered and deliberately
 * not included as their own status; explained in the Phase 20.1C report).
 *
 * `supported`'s `renderControlProven: false` is not a stub to fill in
 * later — it is the explicit, permanent-until-changed statement that this
 * module proves ONLY Admin resource identity + write-scope eligibility,
 * never that writing this field actually changes the public storefront's
 * rendered output. A headless/custom-frontend store could have zero
 * relationship between the two. That proof is Phase 20.1G's job, performed
 * fresh at Prepare/Apply time — nothing may treat `status: 'supported'`
 * alone as sufficient to skip it. The literal `false` type (not `boolean`)
 * means a future phase changing this is a visible, deliberate diff, never
 * an accidental flip.
 */
export type ShopifyFixCapability =
  | {
      status: 'supported'
      fixFamily: ShopifyFixFamily
      resourceType: ShopifyResourceFamily
      requiredScopes: readonly ShopifyGrantedScope[]
      renderControlProven: false
    }
  | {
      status: 'missing_scope'
      fixFamily: ShopifyFixFamily
      resourceType: ShopifyResourceFamily
      requiredScopes: readonly ShopifyGrantedScope[]
      missingScopes: readonly ShopifyGrantedScope[]
    }
  | {
      status: 'unsupported_resource'
      fixFamily: ShopifyFixFamily
      resourceType: ShopifyResourceFamily
    }
  | {
      status: 'localized_context_unsupported'
      fixFamily: ShopifyFixFamily
    }
  | {
      status: 'connection_unhealthy'
      reason: 'unauthorized' | 'connection_error'
    }
  | { status: 'malformed_scope_state' }

/**
 * The single entry point for "can webioom safely fix `fixFamily` for this
 * resource, right now, for this connected Shopify store." Pure and
 * deterministic given its inputs — no network calls of its own.
 *
 * Trust model: `resourceContext` must already be derived from a
 * server-confirmed resource-mapping.ts result (never client-supplied), and
 * `scopesResult` must already be a FRESH call to
 * scopes.ts's getGrantedShopifyScopes for this exact connection (never a
 * stale/stored value used for this decision — see scopes.ts's doc
 * comment). This function trusts its inputs; establishing that those
 * inputs are themselves trustworthy is the caller's job, exactly mirroring
 * resource-mapping.ts's own division of responsibility.
 */
export function evaluateShopifyFixCapability(
  fixFamily: ShopifyFixFamily,
  resourceContext: ShopifyFixCapabilityContext,
  scopesResult: ShopifyGrantedScopesResult
): ShopifyFixCapability {
  if (!scopesResult.ok) {
    if (scopesResult.reason === 'unauthorized') {
      return { status: 'connection_unhealthy', reason: 'unauthorized' }
    }
    if (scopesResult.reason === 'malformed_response' || scopesResult.reason === 'graphql_errors') {
      return { status: 'malformed_scope_state' }
    }
    // 'blocked' | 'timeout' | 'network' | 'unexpected_status'
    return { status: 'connection_unhealthy', reason: 'connection_error' }
  }

  if (resourceContext.resourceContext === 'localized_unsupported') {
    return { status: 'localized_context_unsupported', fixFamily }
  }

  const { resourceType } = resourceContext
  const policy = FIX_FAMILY_RESOURCE_POLICY[fixFamily][resourceType]

  if (policy === 'unsupported_resource') {
    return { status: 'unsupported_resource', fixFamily, resourceType }
  }

  const requiredScopes = policy
  const missing = missingScopes(requiredScopes, scopesResult.scopes as ShopifyGrantedScopeSet)

  if (missing.length > 0) {
    return { status: 'missing_scope', fixFamily, resourceType, requiredScopes, missingScopes: missing }
  }

  return { status: 'supported', fixFamily, resourceType, requiredScopes, renderControlProven: false }
}
