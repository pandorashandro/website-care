import 'server-only'
import { getWixAppConfig } from './config'

const WIX_API_HOST = 'https://www.wixapis.com'
const REQUEST_TIMEOUT_MS = 10_000
const ACCESS_TOKEN_TTL_SECONDS = 4 * 60 * 60 // Wix's documented client_credentials token lifetime

export type WixAccessTokenResult =
  | { ok: true; accessToken: string; expiresInSeconds: number }
  | { ok: false; reason: 'network' | 'timeout' | 'rejected' | 'malformed_response' }

/**
 * Mints a fresh Wix OAuth Client Credentials access token, scoped to one
 * app instance (one site's installation). Per current Wix docs there is no
 * refresh token in this model at all — a caller simply requests a new
 * token whenever needed using the same three values (appId, appSecret,
 * instanceId), all of which are either static app config or the single
 * durable per-connection credential (see wix-credentials.ts). The returned
 * token is valid for 4 hours; callers should treat that as a cache TTL
 * rather than mint one per request, but must never persist it (unlike
 * Shopify's access+refresh pair, this token is cheap to re-mint and
 * intentionally not stored).
 */
export async function createWixAccessToken(instanceId: string): Promise<WixAccessTokenResult> {
  const { appId, appSecret } = getWixAppConfig()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${WIX_API_HOST}/oauth2/token`, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: appId,
        client_secret: appSecret,
        instance_id: instanceId,
      }),
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

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'malformed_response' }
  }

  const accessToken = (parsed as Record<string, unknown>).access_token
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    return { ok: false, reason: 'malformed_response' }
  }

  return { ok: true, accessToken, expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS }
}

export type WixApiResult =
  | { ok: true; status: number; data: Record<string, unknown> }
  | {
      ok: false
      reason: 'unauthorized' | 'forbidden' | 'not_found' | 'invalid_request' | 'blocked' | 'timeout' | 'network' | 'malformed_response' | 'unexpected_status'
      status?: number
    }

/**
 * Sole HTTP primitive for authenticated Wix REST API calls. Deliberately
 * does NOT implement per-call SSRF hostname guarding the way
 * lib/integrations/shopify/client.ts's fetchShopifyGraphQL must — every
 * Wix Admin API call targets the fixed, Wix-owned host `www.wixapis.com`,
 * never a merchant/user-supplied hostname (see docs/wix-api-research.md
 * §9). `redirect: 'error'` and a bounded timeout are kept as baseline
 * transport hygiene regardless.
 */
export async function fetchWixApi(
  path: string,
  accessToken: string,
  init?: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown }
): Promise<WixApiResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${WIX_API_HOST}${path}`, {
      method: init?.method ?? 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Authorization: accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timeout)
  }

  if (response.status === 401) return { ok: false, reason: 'unauthorized', status: response.status }
  if (response.status === 403) return { ok: false, reason: 'forbidden', status: response.status }
  if (response.status === 404) return { ok: false, reason: 'not_found', status: response.status }
  // 400 is distinguished from other non-2xx statuses specifically so
  // write callers (lib/integrations/wix/seo-tags.ts) can report a
  // validation failure (Wix rejected the proposed tag content/shape, e.g.
  // INVALID_TAGS) rather than a generic provider error — Wix's own docs
  // confirm a 400 here never partially applies a change ("a request that
  // contains an invalid tag changes nothing").
  if (response.status === 400) return { ok: false, reason: 'invalid_request', status: response.status }

  if (response.status < 200 || response.status >= 300) {
    return { ok: false, reason: 'unexpected_status', status: response.status }
  }

  let parsed: unknown
  try {
    parsed = response.status === 204 ? {} : await response.json()
  } catch {
    return { ok: false, reason: 'malformed_response', status: response.status }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'malformed_response', status: response.status }
  }

  return { ok: true, status: response.status, data: parsed as Record<string, unknown> }
}
