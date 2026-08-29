import 'server-only'
import { isBlockedHost } from '@/lib/scanner/checks'
import { getShopifyAppConfig } from './config'

const REQUEST_TIMEOUT_MS = 10_000

export type ShopifyGraphQLResult =
  | { ok: true; data: Record<string, unknown> }
  | {
      ok: false
      reason: 'blocked' | 'timeout' | 'network' | 'unauthorized' | 'malformed_response' | 'graphql_errors' | 'unexpected_status'
      detail?: string
    }

/**
 * The sole HTTP primitive for Shopify Admin GraphQL requests. Deliberately
 * a thin, internal request function — not exposed to orchestration as a
 * generic "run any query" tool; every real caller (connection verification
 * today, resource/fix operations in later phases) exports its own
 * purpose-specific function that happens to use this underneath, exactly
 * mirroring lib/integrations/wordpress/client.ts's fetchWordPressApi
 * pattern.
 *
 * `shopDomain` must already be the normalized `{label}.myshopify.com` form
 * (see shop-domain.ts) — never accepted as a raw caller-supplied string
 * here. The API version is always the pinned, server-configured value
 * (SHOPIFY_API_VERSION) — this function has no "version" parameter, so
 * nothing can accidentally call an unpinned/unstable endpoint.
 */
export async function fetchShopifyGraphQL(
  shopDomain: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<ShopifyGraphQLResult> {
  if (isBlockedHost(shopDomain)) {
    return { ok: false, reason: 'blocked' }
  }

  const { apiVersion } = getShopifyAppConfig()
  const endpoint = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // The one and only credential header Shopify Admin GraphQL requests
        // ever carry — never logged, never included in any thrown error.
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify(variables ? { query, variables } : { query }),
    })
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timeout)
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: 'unauthorized' }
  }

  if (response.status < 200 || response.status >= 300) {
    return { ok: false, reason: 'unexpected_status', detail: String(response.status) }
  }

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    return { ok: false, reason: 'malformed_response' }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'malformed_response' }
  }

  const obj = parsed as Record<string, unknown>

  if (Array.isArray(obj.errors) && obj.errors.length > 0) {
    return { ok: false, reason: 'graphql_errors' }
  }

  if (!obj.data || typeof obj.data !== 'object') {
    return { ok: false, reason: 'malformed_response' }
  }

  return { ok: true, data: obj.data as Record<string, unknown> }
}

export type ShopifyIdentity = { shopId: string; myshopifyDomain: string }
export type ShopifyIdentityResult =
  | { ok: true; identity: ShopifyIdentity }
  | Extract<ShopifyGraphQLResult, { ok: false }>

const SHOP_IDENTITY_QUERY = `query WebioomShopIdentity { shop { id myshopifyDomain } }`

/**
 * The minimal authenticated query used to confirm a token actually works
 * and to independently re-derive the shop's own claimed identity — never a
 * broader query merely because a granted scope happens to allow it. The
 * `shop` query requires no scope beyond having any valid access token, so
 * this never over-requests.
 */
export async function verifyShopifyIdentity(shopDomain: string, accessToken: string): Promise<ShopifyIdentityResult> {
  const result = await fetchShopifyGraphQL(shopDomain, accessToken, SHOP_IDENTITY_QUERY)

  if (!result.ok) return result

  const shop = result.data.shop
  if (!shop || typeof shop !== 'object') return { ok: false, reason: 'malformed_response' }

  const shopObj = shop as Record<string, unknown>
  const shopId = shopObj.id
  const myshopifyDomain = shopObj.myshopifyDomain

  if (typeof shopId !== 'string' || typeof myshopifyDomain !== 'string' || !myshopifyDomain) {
    return { ok: false, reason: 'malformed_response' }
  }

  return { ok: true, identity: { shopId, myshopifyDomain: myshopifyDomain.toLowerCase() } }
}
