import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getShopifyAppConfig } from './config'

/**
 * Least-privilege V1 scope set — only what Title/Meta Description direct
 * fixes will need (Phase 20.2D/E). Deliberately excludes read_themes/
 * write_themes/read_files/write_files — see the Phase 20.1 research report
 * for why theme-write access is not requested at all, and why Image Alt
 * (files/media scopes) is deferred to its own later subphase.
 */
export const SHOPIFY_OAUTH_SCOPES = ['read_content', 'write_content', 'read_products', 'write_products'] as const

const OAUTH_CALLBACK_PATH = '/api/integrations/shopify/callback'

/**
 * Builds the Shopify authorize URL a merchant is redirected to. `shopDomain`
 * must already be the normalized `{label}.myshopify.com` form (see
 * shop-domain.ts) — this function does not validate it again, by design,
 * so validation always happens exactly once, at the point the value was
 * first accepted from user input.
 */
export function buildShopifyAuthorizeUrl(params: { shopDomain: string; state: string }): string {
  const { clientId, appUrl } = getShopifyAppConfig()
  const redirectUri = new URL(OAUTH_CALLBACK_PATH, appUrl).toString()

  const url = new URL(`https://${params.shopDomain}/admin/oauth/authorize`)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('scope', SHOPIFY_OAUTH_SCOPES.join(','))
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', params.state)

  return url.toString()
}

export type ShopifyCallbackParams = {
  code: string
  hmac: string
  shop: string
  state: string
  timestamp: string
}

/**
 * Extracts and structurally validates the parameters Shopify's OAuth
 * callback is expected to carry. Returns null if any required parameter is
 * missing or not a string — callers must treat that as a malformed/invalid
 * callback, never guess at defaults.
 */
export function parseShopifyCallbackParams(searchParams: URLSearchParams): ShopifyCallbackParams | null {
  const code = searchParams.get('code')
  const hmac = searchParams.get('hmac')
  const shop = searchParams.get('shop')
  const state = searchParams.get('state')
  const timestamp = searchParams.get('timestamp')

  if (!code || !hmac || !shop || !state || !timestamp) return null

  return { code, hmac, shop, state, timestamp }
}

/**
 * Verifies the OAuth callback's `hmac` query parameter per Shopify's
 * documented algorithm: every OTHER query parameter, sorted alphabetically
 * by key, joined as `key=value&key=value...`, HMAC-SHA256'd with the app's
 * client secret, hex-digested (OAuth callbacks use HEX — Shopify webhook
 * deliveries use BASE64; these are NOT interchangeable, and using the wrong
 * one silently breaks verification rather than failing loudly, so this
 * distinction is deliberately called out here). Comparison is timing-safe.
 */
export function verifyShopifyCallbackHmac(searchParams: URLSearchParams): boolean {
  const { clientSecret } = getShopifyAppConfig()

  const providedHmac = searchParams.get('hmac')
  if (!providedHmac) return false

  const pairs: string[] = []
  for (const [key, value] of searchParams.entries()) {
    if (key === 'hmac') continue
    pairs.push(`${key}=${value}`)
  }
  pairs.sort()
  const message = pairs.join('&')

  const expectedHex = createHmac('sha256', clientSecret).update(message, 'utf8').digest('hex')

  let providedBuf: Buffer
  let expectedBuf: Buffer
  try {
    providedBuf = Buffer.from(providedHmac, 'hex')
    expectedBuf = Buffer.from(expectedHex, 'hex')
  } catch {
    return false
  }

  // A malformed (non-hex, wrong-length) provided hmac must fail closed
  // rather than throw out of this function.
  if (providedBuf.length !== expectedBuf.length) return false

  return timingSafeEqual(providedBuf, expectedBuf)
}

export type ShopifyOfflineTokenResponse = {
  accessToken: string
  scope: string
  expiresInSeconds: number
  refreshToken: string
  refreshTokenExpiresInSeconds: number
}

export type ShopifyTokenExchangeResult =
  | { ok: true; token: ShopifyOfflineTokenResponse }
  | { ok: false; reason: 'network' | 'timeout' | 'rejected' | 'malformed_response' }

const REQUEST_TIMEOUT_MS = 10_000

function validateOfflineTokenResponse(body: unknown): ShopifyOfflineTokenResponse | null {
  if (!body || typeof body !== 'object') return null
  const obj = body as Record<string, unknown>

  const accessToken = obj.access_token
  const scope = obj.scope
  const expiresIn = obj.expires_in
  const refreshToken = obj.refresh_token
  const refreshTokenExpiresIn = obj.refresh_token_expires_in

  // Every field required here is exactly what Phase 20.1 confirmed the
  // expiring-offline-token response shape carries (§3/§17 of the 20.2A
  // brief) — a response missing any of them is not usable for webioom's
  // connection model and must fail closed rather than be guessed at.
  if (
    typeof accessToken !== 'string' ||
    accessToken.length === 0 ||
    typeof scope !== 'string' ||
    typeof expiresIn !== 'number' ||
    expiresIn <= 0 ||
    typeof refreshToken !== 'string' ||
    refreshToken.length === 0 ||
    typeof refreshTokenExpiresIn !== 'number' ||
    refreshTokenExpiresIn <= 0
  ) {
    return null
  }

  return {
    accessToken,
    scope,
    expiresInSeconds: expiresIn,
    refreshToken,
    refreshTokenExpiresInSeconds: refreshTokenExpiresIn,
  }
}

async function postShopifyOAuthToken(shopDomain: string, body: Record<string, string>): Promise<ShopifyTokenExchangeResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(body).toString(),
    })
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timeout)
  }

  if (response.status < 200 || response.status >= 300) {
    return { ok: false, reason: 'rejected' }
  }

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    return { ok: false, reason: 'malformed_response' }
  }

  const token = validateOfflineTokenResponse(parsed)
  if (!token) return { ok: false, reason: 'malformed_response' }

  return { ok: true, token }
}

/**
 * Exchanges a one-time authorization code for an EXPIRING offline access
 * token + refresh token pair — server-to-server only, client_secret never
 * leaves this request. `expiring: '1'` is required on this exact request
 * (confirmed against current official Shopify documentation in this
 * phase's fresh doc check) to receive the modern expiring-token shape;
 * without it Shopify returns the legacy non-expiring shape, which the
 * Admin API now rejects for public apps.
 */
export async function exchangeShopifyAuthorizationCode(params: {
  shopDomain: string
  code: string
}): Promise<ShopifyTokenExchangeResult> {
  const { clientId, clientSecret } = getShopifyAppConfig()

  return postShopifyOAuthToken(params.shopDomain, {
    client_id: clientId,
    client_secret: clientSecret,
    code: params.code,
    expiring: '1',
  })
}

/**
 * Exchanges a still-valid refresh token for a new access+refresh token
 * pair. Per Shopify's documented rotation behavior, EVERY refresh returns
 * a new refresh token — the old one must be discarded in favor of the one
 * returned here, never reused.
 */
export async function refreshShopifyAccessToken(params: {
  shopDomain: string
  refreshToken: string
}): Promise<ShopifyTokenExchangeResult> {
  const { clientId, clientSecret } = getShopifyAppConfig()

  return postShopifyOAuthToken(params.shopDomain, {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
  })
}
