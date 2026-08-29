import 'server-only'
import { fetchShopifyGraphQL, type ShopifyGraphQLResult } from './client'

export type ShopifyStoreIdentity = {
  shopId: string
  myshopifyDomain: string
  /** null if Shopify reports no primary domain, or an unreadable one — never guessed. */
  primaryDomainHost: string | null
}

export type ShopifyStoreIdentityResult = { ok: true; identity: ShopifyStoreIdentity } | Extract<ShopifyGraphQLResult, { ok: false }>

const STORE_IDENTITY_QUERY = `query WebioomShopifyStoreIdentity {
  shop {
    id
    myshopifyDomain
    primaryDomain {
      host
    }
  }
}`

/**
 * Fetches the connected shop's own authoritative identity — the canonical
 * myshopify.com domain and, separately, its current primary (customer-
 * facing) domain host, if any. Always queried fresh; never read from a
 * stored/cached value, so a merchant changing their primary domain is
 * reflected on the very next call rather than silently going stale.
 */
export async function getShopifyStoreIdentity(shopDomain: string, accessToken: string): Promise<ShopifyStoreIdentityResult> {
  const result = await fetchShopifyGraphQL(shopDomain, accessToken, STORE_IDENTITY_QUERY)
  if (!result.ok) return result

  const shop = result.data.shop
  if (!shop || typeof shop !== 'object') return { ok: false, reason: 'malformed_response' }

  const shopObj = shop as Record<string, unknown>
  const shopId = shopObj.id
  const myshopifyDomain = shopObj.myshopifyDomain

  if (typeof shopId !== 'string' || typeof myshopifyDomain !== 'string' || !myshopifyDomain) {
    return { ok: false, reason: 'malformed_response' }
  }

  let primaryDomainHost: string | null = null
  const primaryDomain = shopObj.primaryDomain
  if (primaryDomain && typeof primaryDomain === 'object') {
    const host = (primaryDomain as Record<string, unknown>).host
    if (typeof host === 'string' && host) primaryDomainHost = host.toLowerCase()
  }

  return {
    ok: true,
    identity: { shopId, myshopifyDomain: myshopifyDomain.toLowerCase(), primaryDomainHost },
  }
}

/**
 * The ONE function anything in this codebase is allowed to use to decide
 * "does this public hostname belong to the connected Shopify store."
 * Accepts a hostname only if it exactly (case-insensitively) matches
 * either the canonical myshopify.com domain or the store's own current,
 * freshly-queried primary domain host — never derived from the webioom
 * website record's own stored URL, never widened for www/non-www or other
 * variants, since Shopify's Domain object (as queried here) exposes only
 * a single exact `host` string, not a list of equivalent hostnames. See
 * this phase's report for the known limitation this implies (a website
 * recorded with a www-prefixed URL that differs from Shopify's own exact
 * primaryDomain.host would currently fail closed rather than match) —
 * deliberately the safe direction to fail in.
 */
export function hostnameMatchesStoreIdentity(hostname: string, identity: ShopifyStoreIdentity): boolean {
  const normalizedHostname = hostname.toLowerCase()
  return normalizedHostname === identity.myshopifyDomain || (identity.primaryDomainHost !== null && normalizedHostname === identity.primaryDomainHost)
}
