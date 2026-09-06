import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

export type PaddleSignatureVerification =
  | { ok: true }
  | { ok: false; reason: 'missing_header' | 'malformed_header' | 'timestamp_out_of_tolerance' | 'signature_mismatch' }

/**
 * Paddle's documented tolerance between the signature's `ts` and the
 * verifying server's clock is five seconds — developer.paddle.com's
 * signature-verification page states this exactly: "The default tolerance
 * between the timestamp and the current time is five seconds." Paddle's
 * own SDK helper methods enforce this same value. This module follows
 * that documented behavior exactly rather than widening it for
 * hypothetical serverless delivery delay — a wider window is a real,
 * undocumented weakening of replay protection, not a safe default, and is
 * not something this codebase should decide on its own authority in place
 * of the provider's own documented recommendation. If production
 * experience later shows legitimate webhooks are being rejected under this
 * tolerance, that is itself an operational finding to bring back for an
 * explicit decision — not something to pre-empt by quietly loosening
 * security here.
 */
const TIMESTAMP_TOLERANCE_SECONDS = 5

function parseSignatureHeader(header: string): { ts: string; h1: string } | null {
  const parts = new Map<string, string>()

  for (const segment of header.split(';')) {
    const [key, value] = segment.split('=')
    if (key && value) parts.set(key.trim(), value.trim())
  }

  const ts = parts.get('ts')
  const h1 = parts.get('h1')

  if (!ts || !h1 || !/^\d+$/.test(ts) || !/^[0-9a-f]+$/i.test(h1)) return null

  return { ts, h1 }
}

/**
 * Verifies a Paddle webhook's `Paddle-Signature` header against the RAW
 * request body, mirroring lib/integrations/shopify/webhook.ts's
 * verifyShopifyWebhookHmac in spirit (timing-safe comparison, raw body
 * only) but adapted to Paddle's own format: `ts=<unix_seconds>;h1=<hex>`,
 * where the signed payload is `${ts}:${rawBody}` and the digest is
 * hex-encoded HMAC-SHA256 (never base64 — that is Shopify's convention,
 * not Paddle's).
 *
 * `rawBody` must be the exact, unparsed request body string — computing
 * this over a JSON.parse()'d-and-reserialized body would not match
 * Paddle's own digest, since re-serialization is not guaranteed
 * byte-identical to what Paddle actually sent (Paddle's own docs warn
 * against exactly this).
 */
export function verifyPaddleWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  now: number = Date.now()
): PaddleSignatureVerification {
  if (!signatureHeader) return { ok: false, reason: 'missing_header' }

  const parsed = parseSignatureHeader(signatureHeader)
  if (!parsed) return { ok: false, reason: 'malformed_header' }

  const { ts, h1 } = parsed

  const tsMs = Number(ts) * 1000
  if (Math.abs(now - tsMs) > TIMESTAMP_TOLERANCE_SECONDS * 1000) {
    return { ok: false, reason: 'timestamp_out_of_tolerance' }
  }

  const expectedHex = createHmac('sha256', webhookSecret).update(`${ts}:${rawBody}`, 'utf8').digest('hex')

  const providedBuf = Buffer.from(h1, 'hex')
  const expectedBuf = Buffer.from(expectedHex, 'hex')

  if (providedBuf.length !== expectedBuf.length) return { ok: false, reason: 'signature_mismatch' }
  if (!timingSafeEqual(providedBuf, expectedBuf)) return { ok: false, reason: 'signature_mismatch' }

  return { ok: true }
}
