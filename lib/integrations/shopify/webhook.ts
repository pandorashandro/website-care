import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getShopifyAppConfig } from './config'

/**
 * Verifies a Shopify webhook delivery's `X-Shopify-Hmac-Sha256` header
 * against the RAW request body. This is a deliberately separate function
 * from oauth.ts's verifyShopifyCallbackHmac — the two algorithms are NOT
 * interchangeable: OAuth callback HMAC is computed over a sorted
 * query-string and hex-digested; webhook HMAC is computed over the raw
 * request body and BASE64-digested. Using the wrong one silently fails
 * verification rather than erroring loudly, so keeping them as distinct,
 * separately-named functions is a deliberate safeguard against ever
 * confusing one for the other.
 *
 * `rawBody` must be the exact, unparsed request body string — computing
 * this over a JSON.parse()'d-and-reserialized body would not match
 * Shopify's own digest, since re-serialization is not guaranteed
 * byte-identical to what Shopify actually sent.
 */
export function verifyShopifyWebhookHmac(rawBody: string, providedHmacBase64: string | null): boolean {
  if (!providedHmacBase64) return false

  const { clientSecret } = getShopifyAppConfig()
  const expectedBase64 = createHmac('sha256', clientSecret).update(rawBody, 'utf8').digest('base64')

  let providedBuf: Buffer
  let expectedBuf: Buffer
  try {
    providedBuf = Buffer.from(providedHmacBase64, 'base64')
    expectedBuf = Buffer.from(expectedBase64, 'base64')
  } catch {
    return false
  }

  if (providedBuf.length !== expectedBuf.length) return false

  return timingSafeEqual(providedBuf, expectedBuf)
}
