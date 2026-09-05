import { describe, it, expect, beforeAll } from 'vitest'
import { createHmac } from 'node:crypto'
import { normalizeShopifyShopDomain } from '@/lib/integrations/shopify/shop-domain'

/**
 * Phase 21 — permanent regression coverage for the two Shopify HMAC
 * algorithms and shop-domain normalization. Uses SYNTHETIC, hardcoded
 * placeholder credentials purely to exercise the deterministic HMAC math —
 * never a real Shopify app secret, and no live network/API call is ever
 * made by any test in this file.
 */

const FAKE_CLIENT_SECRET = 'test-only-not-a-real-shopify-secret'

beforeAll(() => {
  process.env.SHOPIFY_CLIENT_ID = 'test-client-id'
  process.env.SHOPIFY_CLIENT_SECRET = FAKE_CLIENT_SECRET
  process.env.SHOPIFY_API_VERSION = '2026-07'
  process.env.SHOPIFY_APP_URL = 'https://example.test'
})

describe('normalizeShopifyShopDomain', () => {
  it('accepts a bare label', () => {
    expect(normalizeShopifyShopDomain('my-store')).toBe('my-store.myshopify.com')
  })

  it('accepts a bare canonical hostname', () => {
    expect(normalizeShopifyShopDomain('my-store.myshopify.com')).toBe('my-store.myshopify.com')
  })

  it('accepts a full https URL with no path/query', () => {
    expect(normalizeShopifyShopDomain('https://my-store.myshopify.com')).toBe('my-store.myshopify.com')
  })

  it('is case-insensitive', () => {
    expect(normalizeShopifyShopDomain('My-Store.MyShopify.Com')).toBe('my-store.myshopify.com')
  })

  it('rejects http:// (non-https)', () => {
    expect(normalizeShopifyShopDomain('http://my-store.myshopify.com')).toBeNull()
  })

  it('rejects a URL with userinfo', () => {
    expect(normalizeShopifyShopDomain('https://user:pass@my-store.myshopify.com')).toBeNull()
  })

  it('rejects a URL with an explicit port', () => {
    expect(normalizeShopifyShopDomain('https://my-store.myshopify.com:8443')).toBeNull()
  })

  it('rejects a URL with a path/query/fragment', () => {
    expect(normalizeShopifyShopDomain('https://my-store.myshopify.com/admin')).toBeNull()
    expect(normalizeShopifyShopDomain('https://my-store.myshopify.com?x=1')).toBeNull()
    expect(normalizeShopifyShopDomain('https://my-store.myshopify.com#x')).toBeNull()
  })

  it('rejects a bare string carrying a path/userinfo/port shape', () => {
    expect(normalizeShopifyShopDomain('my-store.myshopify.com/admin')).toBeNull()
    expect(normalizeShopifyShopDomain('user:pass@my-store.myshopify.com')).toBeNull()
  })

  it('rejects a hostname that merely CONTAINS myshopify.com without an exact dot-bounded suffix', () => {
    expect(normalizeShopifyShopDomain('evilmyshopify.com')).toBeNull()
    expect(normalizeShopifyShopDomain('myshopify.com.attacker.net')).toBeNull()
  })

  it('rejects whitespace and empty input', () => {
    expect(normalizeShopifyShopDomain('   ')).toBeNull()
    expect(normalizeShopifyShopDomain('')).toBeNull()
    expect(normalizeShopifyShopDomain('my store')).toBeNull()
  })

  it('rejects non-ASCII/IDN labels', () => {
    expect(normalizeShopifyShopDomain('café')).toBeNull()
  })

  it('rejects a label starting or ending with a hyphen', () => {
    expect(normalizeShopifyShopDomain('-store')).toBeNull()
    expect(normalizeShopifyShopDomain('store-')).toBeNull()
  })
})

describe('verifyShopifyCallbackHmac (OAuth callback — hex digest over sorted query string)', () => {
  it('accepts a correctly computed hmac', async () => {
    const { verifyShopifyCallbackHmac } = await import('@/lib/integrations/shopify/oauth')

    const params = new URLSearchParams({
      code: 'abc123',
      shop: 'my-store.myshopify.com',
      state: 'xyz',
      timestamp: '1700000000',
    })
    const message = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('&')
    const validHmac = createHmac('sha256', FAKE_CLIENT_SECRET).update(message, 'utf8').digest('hex')
    params.set('hmac', validHmac)

    expect(verifyShopifyCallbackHmac(params)).toBe(true)
  })

  it('rejects a tampered parameter (hmac no longer matches)', async () => {
    const { verifyShopifyCallbackHmac } = await import('@/lib/integrations/shopify/oauth')

    const params = new URLSearchParams({
      code: 'abc123',
      shop: 'my-store.myshopify.com',
      state: 'xyz',
      timestamp: '1700000000',
    })
    const message = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('&')
    const validHmac = createHmac('sha256', FAKE_CLIENT_SECRET).update(message, 'utf8').digest('hex')
    params.set('hmac', validHmac)
    params.set('shop', 'attacker-store.myshopify.com') // tamper AFTER signing

    expect(verifyShopifyCallbackHmac(params)).toBe(false)
  })

  it('rejects a missing hmac parameter', async () => {
    const { verifyShopifyCallbackHmac } = await import('@/lib/integrations/shopify/oauth')
    const params = new URLSearchParams({ code: 'abc123', shop: 'my-store.myshopify.com' })
    expect(verifyShopifyCallbackHmac(params)).toBe(false)
  })

  it('rejects a malformed (non-hex) hmac rather than throwing', async () => {
    const { verifyShopifyCallbackHmac } = await import('@/lib/integrations/shopify/oauth')
    const params = new URLSearchParams({ code: 'abc123', hmac: 'not-hex-!!!' })
    expect(() => verifyShopifyCallbackHmac(params)).not.toThrow()
    expect(verifyShopifyCallbackHmac(params)).toBe(false)
  })
})

describe('verifyShopifyWebhookHmac (webhook delivery — base64 digest over raw body)', () => {
  it('accepts a correctly computed hmac', async () => {
    const { verifyShopifyWebhookHmac } = await import('@/lib/integrations/shopify/webhook')
    const rawBody = JSON.stringify({ shop_id: 123, domain: 'my-store.myshopify.com' })
    const validHmac = createHmac('sha256', FAKE_CLIENT_SECRET).update(rawBody, 'utf8').digest('base64')

    expect(verifyShopifyWebhookHmac(rawBody, validHmac)).toBe(true)
  })

  it('rejects a body that does not match the provided hmac', async () => {
    const { verifyShopifyWebhookHmac } = await import('@/lib/integrations/shopify/webhook')
    const validHmac = createHmac('sha256', FAKE_CLIENT_SECRET).update('original-body', 'utf8').digest('base64')

    expect(verifyShopifyWebhookHmac('tampered-body', validHmac)).toBe(false)
  })

  it('rejects a null hmac', async () => {
    const { verifyShopifyWebhookHmac } = await import('@/lib/integrations/shopify/webhook')
    expect(verifyShopifyWebhookHmac('some-body', null)).toBe(false)
  })

  it('the webhook (base64) and callback (hex) algorithms are not interchangeable — a valid webhook hmac must not verify as a callback hmac for the same payload', async () => {
    const { verifyShopifyCallbackHmac } = await import('@/lib/integrations/shopify/oauth')
    const rawBody = 'shop=my-store.myshopify.com'
    const base64Hmac = createHmac('sha256', FAKE_CLIENT_SECRET).update(rawBody, 'utf8').digest('base64')

    const params = new URLSearchParams({ shop: 'my-store.myshopify.com', hmac: base64Hmac })
    expect(verifyShopifyCallbackHmac(params)).toBe(false)
  })
})
