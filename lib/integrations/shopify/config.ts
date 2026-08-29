import 'server-only'

export type ShopifyAppConfig = {
  clientId: string
  clientSecret: string
  apiVersion: string
  /**
   * The canonical, server-controlled base URL used to build the OAuth
   * redirect_uri sent to Shopify — deliberately never derived from an
   * incoming request's Host header (which is attacker-influenceable).
   * Must exactly match the redirect URL registered for this app in the
   * Shopify Partner Dashboard.
   */
  appUrl: string
}

/**
 * Reads and validates the server-only Shopify app configuration. Throws a
 * generic Error (never logging the actual values) if anything required is
 * missing or malformed — callers must treat that as "Shopify connection
 * unavailable" rather than let it crash a request unexpectedly.
 */
export function getShopifyAppConfig(): ShopifyAppConfig {
  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  const apiVersion = process.env.SHOPIFY_API_VERSION
  const appUrl = process.env.SHOPIFY_APP_URL

  if (!clientId || !clientSecret || !apiVersion || !appUrl) {
    throw new Error('Shopify app configuration is not fully set.')
  }

  if (!/^\d{4}-(01|04|07|10)$/.test(apiVersion)) {
    throw new Error('SHOPIFY_API_VERSION must be a pinned quarterly version (e.g. "2026-07"), never "latest" or "unstable".')
  }

  let parsedAppUrl: URL
  try {
    parsedAppUrl = new URL(appUrl)
  } catch {
    throw new Error('SHOPIFY_APP_URL must be a valid absolute URL.')
  }

  if (parsedAppUrl.protocol !== 'https:') {
    throw new Error('SHOPIFY_APP_URL must use https.')
  }

  return { clientId, clientSecret, apiVersion, appUrl }
}
