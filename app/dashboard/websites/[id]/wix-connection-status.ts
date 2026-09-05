import 'server-only'
import type { IntegrationConnectionState } from '@/lib/integrations/platform'
import { getWixSiteIdentity } from '@/lib/integrations/wix/site-identity'
import { getWixConnectionSummary, getValidWixAccessToken } from './wix-credentials'

export type WixConnectionStatus =
  | { connected: false }
  | { connected: true; siteId: string; connectionValid: false }
  | { connected: true; siteId: string; connectionValid: true; siteDisplayName: string | null }

/**
 * Wix V1 Prompt 3 — the Wix-side counterpart to
 * shopify-connection-status.ts's getShopifyConnectionStatus: a single,
 * live-checked connection status meant to back BOTH the integration card
 * (Connected / Needs attention) and fixability evaluation, exactly the
 * way WordPress's and Shopify's cards each share one live check today
 * rather than each performing their own.
 *
 * getWixConnectionSummary alone only reports whether a `connected` row
 * exists in wix_connections — it never proves the stored instanceId still
 * mints a usable access token. This function additionally exercises
 * getValidWixAccessToken (minting a fresh client-credentials token) and
 * then getWixSiteIdentity (a real, authenticated Site Properties API
 * call) as the live proof the connection is currently usable — mirroring
 * Shopify's own token-then-live-API-call pattern, since Wix has no
 * separate scopes-introspection endpoint to call instead (see
 * docs/wix-api-research.md §8). A failure at either step is reported as
 * `connectionValid: false` ("needs attention"), never as `connected:
 * false` — the stored connection still exists and disconnecting/
 * reconnecting remains the user's own choice.
 */
export async function getWixConnectionStatus(websiteId: string): Promise<WixConnectionStatus> {
  const summary = await getWixConnectionSummary(websiteId)

  if (!summary.connected) {
    return { connected: false }
  }

  const tokenResult = await getValidWixAccessToken(websiteId)
  if (!tokenResult.ok) {
    return { connected: true, siteId: summary.siteId, connectionValid: false }
  }

  const siteIdentity = await getWixSiteIdentity(tokenResult.accessToken)
  if (!siteIdentity.ok) {
    return { connected: true, siteId: summary.siteId, connectionValid: false }
  }

  return {
    connected: true,
    siteId: summary.siteId,
    connectionValid: true,
    siteDisplayName: siteIdentity.siteDisplayName,
  }
}

export type WixIssueFixabilityInputs = { connectionState: IntegrationConnectionState }

/** Thin, pure mapper from the Wix-specific status above to the generic inputs lib/integrations/wix/issue-fixability.ts consumes — mirrors shopify-connection-status.ts's toShopifyIssueFixabilityInputs exactly in spirit. */
export function toWixIssueFixabilityInputs(status: WixConnectionStatus): WixIssueFixabilityInputs {
  if (!status.connected) {
    return { connectionState: 'not_connected' }
  }
  if (!status.connectionValid) {
    return { connectionState: 'needs_attention' }
  }
  return { connectionState: 'connected' }
}
