import 'server-only'

export type WixAppConfig = {
  appId: string
  appSecret: string
  /**
   * The canonical, server-controlled base URL used to build the External
   * Install Flow's `postInstallationUrl` callback — deliberately never
   * derived from an incoming request's Host header (attacker-influenceable),
   * mirroring lib/integrations/shopify/config.ts's appUrl exactly.
   */
  appUrl: string
}

/**
 * Reads and validates the server-only Wix app configuration. Throws a
 * generic Error (never logging the actual values) if anything required is
 * missing or malformed — callers must treat that as "Wix connection
 * unavailable" rather than let it crash a request unexpectedly.
 *
 * Unlike lib/integrations/shopify/config.ts, there is no pinned API
 * version here: Wix's REST APIs (oauth2/token, promote/seo/v1/...) are not
 * versioned via a request parameter the way Shopify's Admin API is — each
 * endpoint is its own versioned path (e.g. `.../seo/v1/...`), so there is
 * no single app-wide "API version" value to configure or pin.
 */
export function getWixAppConfig(): WixAppConfig {
  const appId = process.env.WIX_APP_ID
  const appSecret = process.env.WIX_APP_SECRET
  const appUrl = process.env.WIX_APP_URL

  if (!appId || !appSecret || !appUrl) {
    throw new Error('Wix app configuration is not fully set.')
  }

  let parsedAppUrl: URL
  try {
    parsedAppUrl = new URL(appUrl)
  } catch {
    throw new Error('WIX_APP_URL must be a valid absolute URL.')
  }

  if (parsedAppUrl.protocol !== 'https:') {
    throw new Error('WIX_APP_URL must use https.')
  }

  return { appId, appSecret, appUrl }
}
