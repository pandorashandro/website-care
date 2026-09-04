import 'server-only'
import type { IntegrationConnectionState } from '@/lib/integrations/platform'
import type { ShopifyGrantedScopeSet } from '@/lib/integrations/shopify/scopes'
import { getGrantedShopifyScopes } from '@/lib/integrations/shopify/scopes'
import { getShopifyConnectionSummary, getValidShopifyAccessToken } from './shopify-credentials'

export type ShopifyConnectionStatus =
  | { connected: false }
  | { connected: true; myshopifyDomain: string; connectionValid: false }
  | { connected: true; myshopifyDomain: string; connectionValid: true; grantedScopes: ShopifyGrantedScopeSet }

/**
 * Phase 20.1H — the Shopify-side counterpart to
 * wordpress-capabilities.ts's getWordPressConnectionSummary: a single,
 * live-checked connection status meant to back BOTH the integration card
 * (Connected / Needs attention) and fixability evaluation, exactly the way
 * WordPress's card and evaluateFixability share one live check today rather
 * than each performing their own.
 *
 * getShopifyConnectionSummary alone only reports whether a `connected` row
 * exists in shopify_connections — it never proves the stored token still
 * works. This function additionally exercises getValidShopifyAccessToken
 * (refreshing if needed) and then getGrantedShopifyScopes — a real,
 * authenticated Admin API call — as the live proof the connection is
 * currently usable, and returns the FRESH scope set from that same call
 * (never the possibly-stale `granted_scopes` column) for fixability to
 * reason about. A failure at either step is reported as `connectionValid:
 * false` ("needs attention"), never as `connected: false` — the stored
 * connection still exists and disconnecting/reconnecting is still the
 * user's choice to make, not something this function does silently.
 */
export async function getShopifyConnectionStatus(websiteId: string): Promise<ShopifyConnectionStatus> {
  const summary = await getShopifyConnectionSummary(websiteId)

  if (!summary.connected) {
    return { connected: false }
  }

  const tokenResult = await getValidShopifyAccessToken(websiteId)
  if (!tokenResult.ok) {
    return { connected: true, myshopifyDomain: summary.myshopifyDomain, connectionValid: false }
  }

  const scopesResult = await getGrantedShopifyScopes(tokenResult.myshopifyDomain, tokenResult.accessToken)
  if (!scopesResult.ok) {
    return { connected: true, myshopifyDomain: summary.myshopifyDomain, connectionValid: false }
  }

  return {
    connected: true,
    myshopifyDomain: summary.myshopifyDomain,
    connectionValid: true,
    grantedScopes: scopesResult.scopes,
  }
}

export type ShopifyIssueFixabilityInputs = {
  connectionState: IntegrationConnectionState
  grantedScopes: ShopifyGrantedScopeSet | null
}

/** Thin, pure mapper from the Shopify-specific status above to the generic inputs lib/integrations/shopify/issue-fixability.ts consumes — mirrors wordpress-capabilities.ts's toIntegrationFixabilityInputs exactly in spirit. */
export function toShopifyIssueFixabilityInputs(status: ShopifyConnectionStatus): ShopifyIssueFixabilityInputs {
  if (!status.connected) {
    return { connectionState: 'not_connected', grantedScopes: null }
  }

  if (!status.connectionValid) {
    return { connectionState: 'needs_attention', grantedScopes: null }
  }

  return { connectionState: 'connected', grantedScopes: status.grantedScopes }
}
