import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getWixAppConfig } from './config'

const INSTALLER_BASE_URL = 'https://www.wix.com/app-installer'

/**
 * Builds the External Install Flow URL a site owner is redirected to.
 * `callbackUrl` must already include our own opaque `state` query parameter
 * (see wix-oauth-actions.ts) — this function does not add one itself, so
 * state generation always happens exactly once, at the point it is first
 * created, mirroring lib/integrations/shopify/oauth.ts's
 * buildShopifyAuthorizeUrl's "validate/construct exactly once" convention.
 *
 * `shareUrlId` is required only for unlisted apps (see
 * docs/wix-api-research.md §2) — omit it once webioom's Wix app is listed
 * on the App Market, if that ever happens; passing it unconditionally
 * would be silently ignored by listed apps per Wix's own docs, but keeping
 * it optional here documents the real distinction rather than hiding it.
 */
export function buildWixInstallUrl(params: { callbackUrl: string; shareUrlId?: string }): string {
  const { appId } = getWixAppConfig()

  const url = new URL(INSTALLER_BASE_URL)
  url.searchParams.set('appId', appId)
  url.searchParams.set('postInstallationUrl', params.callbackUrl)
  if (params.shareUrlId) {
    url.searchParams.set('shareUrlId', params.shareUrlId)
  }

  return url.toString()
}

export type WixSignedInstancePayload = {
  instanceId: string
  siteId?: string
  [key: string]: unknown
}

export type VerifiedWixSignedInstance =
  | { ok: true; payload: WixSignedInstancePayload }
  | { ok: false; reason: 'malformed' | 'invalid_signature' }

function base64UrlToBuffer(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/**
 * Verifies the `signedInstance` value the External Install Flow callback
 * appends to the redirect. See docs/wix-api-research.md §3 for why this
 * specific HMAC-SHA256(`appSecret`, base64Payload) format was chosen: it
 * is the only Wix-documented format specified with byte-level precision
 * (Wix's own Node.js/PHP/Java/Ruby samples), even though the page
 * describing it is marked legacy for a different specific use (the
 * iframe `instance` query parameter). Confirming this exact format against
 * a real Wix install — or migrating to a live Token Info call once its
 * schema is confirmed — is required before Beta; this is deliberately not
 * papered over (see that section).
 *
 * Format: `<base64url-HMAC-SHA256-signature>.<base64 JSON payload>`.
 * Comparison is timing-safe. Never throws on malformed input.
 */
export function verifyWixSignedInstance(signedInstance: string): VerifiedWixSignedInstance {
  const { appSecret } = getWixAppConfig()

  const separatorIndex = signedInstance.indexOf('.')
  if (separatorIndex <= 0 || separatorIndex === signedInstance.length - 1) {
    return { ok: false, reason: 'malformed' }
  }

  const providedSignatureB64Url = signedInstance.slice(0, separatorIndex)
  const encodedPayload = signedInstance.slice(separatorIndex + 1)

  let providedSignature: Buffer
  let expectedSignature: Buffer
  try {
    providedSignature = base64UrlToBuffer(providedSignatureB64Url)
    expectedSignature = createHmac('sha256', appSecret).update(encodedPayload, 'utf8').digest()
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (providedSignature.length !== expectedSignature.length) {
    return { ok: false, reason: 'invalid_signature' }
  }

  if (!timingSafeEqual(providedSignature, expectedSignature)) {
    return { ok: false, reason: 'invalid_signature' }
  }

  let decodedPayload: unknown
  try {
    decodedPayload = JSON.parse(base64UrlToBuffer(encodedPayload).toString('utf8'))
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (!decodedPayload || typeof decodedPayload !== 'object') {
    return { ok: false, reason: 'malformed' }
  }

  const instanceId = (decodedPayload as Record<string, unknown>).instanceId
  if (typeof instanceId !== 'string' || instanceId.length === 0) {
    return { ok: false, reason: 'malformed' }
  }

  return { ok: true, payload: decodedPayload as WixSignedInstancePayload }
}
