import { describe, it, expect, beforeAll } from 'vitest'
import { createHmac } from 'node:crypto'

/**
 * Wix V1 Prompt 1 — permanent regression coverage for the install-callback
 * signature scheme. Uses SYNTHETIC, hardcoded placeholder credentials
 * purely to exercise the deterministic HMAC math — never a real Wix app
 * secret, and no live network/API call is ever made by any test in this
 * file. See docs/wix-api-research.md §3 for why this exact format was
 * chosen despite the source page being marked legacy for a different use.
 */

const FAKE_APP_SECRET = 'test-only-not-a-real-wix-secret'

beforeAll(() => {
  process.env.WIX_APP_ID = 'test-app-id'
  process.env.WIX_APP_SECRET = FAKE_APP_SECRET
  process.env.WIX_APP_URL = 'https://example.test'
})

function signPayload(payload: Record<string, unknown>): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = createHmac('sha256', FAKE_APP_SECRET).update(encodedPayload, 'utf8').digest('base64url')
  return `${signature}.${encodedPayload}`
}

describe('verifyWixSignedInstance', () => {
  it('accepts a correctly signed instance payload', async () => {
    const { verifyWixSignedInstance } = await import('@/lib/integrations/wix/install')
    const signed = signPayload({ instanceId: 'abc-123', siteId: 'site-1' })

    const result = verifyWixSignedInstance(signed)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.instanceId).toBe('abc-123')
    }
  })

  it('rejects a tampered payload (signature no longer matches)', async () => {
    const { verifyWixSignedInstance } = await import('@/lib/integrations/wix/install')
    const signed = signPayload({ instanceId: 'abc-123' })
    const [signature] = signed.split('.')
    const tamperedPayload = Buffer.from(JSON.stringify({ instanceId: 'attacker-controlled' }), 'utf8').toString('base64url')

    const result = verifyWixSignedInstance(`${signature}.${tamperedPayload}`)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_signature')
    }
  })

  it('rejects a payload signed with a different secret', async () => {
    const { verifyWixSignedInstance } = await import('@/lib/integrations/wix/install')
    const encodedPayload = Buffer.from(JSON.stringify({ instanceId: 'abc-123' }), 'utf8').toString('base64url')
    const wrongSignature = createHmac('sha256', 'a-different-secret').update(encodedPayload, 'utf8').digest('base64url')

    const result = verifyWixSignedInstance(`${wrongSignature}.${encodedPayload}`)
    expect(result.ok).toBe(false)
  })

  it('rejects malformed input (no separator) without throwing', async () => {
    const { verifyWixSignedInstance } = await import('@/lib/integrations/wix/install')
    expect(() => verifyWixSignedInstance('not-a-valid-token')).not.toThrow()
    const result = verifyWixSignedInstance('not-a-valid-token')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('malformed')
    }
  })

  it('rejects a payload missing instanceId', async () => {
    const { verifyWixSignedInstance } = await import('@/lib/integrations/wix/install')
    const signed = signPayload({ siteId: 'site-1' })

    const result = verifyWixSignedInstance(signed)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('malformed')
    }
  })

  it('rejects non-JSON payload content', async () => {
    const { verifyWixSignedInstance } = await import('@/lib/integrations/wix/install')
    const encodedPayload = Buffer.from('not json at all', 'utf8').toString('base64url')
    const signature = createHmac('sha256', FAKE_APP_SECRET).update(encodedPayload, 'utf8').digest('base64url')

    const result = verifyWixSignedInstance(`${signature}.${encodedPayload}`)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('malformed')
    }
  })
})

describe('buildWixInstallUrl', () => {
  it('builds an installer URL with appId and an encoded postInstallationUrl', async () => {
    const { buildWixInstallUrl } = await import('@/lib/integrations/wix/install')
    const callbackUrl = 'https://example.test/api/integrations/wix/callback?state=opaque-token-123'

    const installUrl = buildWixInstallUrl({ callbackUrl })
    const parsed = new URL(installUrl)

    expect(parsed.origin + parsed.pathname).toBe('https://www.wix.com/app-installer')
    expect(parsed.searchParams.get('appId')).toBe('test-app-id')
    expect(parsed.searchParams.get('postInstallationUrl')).toBe(callbackUrl)
  })

  it('includes shareUrlId when provided (unlisted app case)', async () => {
    const { buildWixInstallUrl } = await import('@/lib/integrations/wix/install')
    const installUrl = buildWixInstallUrl({
      callbackUrl: 'https://example.test/api/integrations/wix/callback?state=abc',
      shareUrlId: 'share-url-guid',
    })

    expect(new URL(installUrl).searchParams.get('shareUrlId')).toBe('share-url-guid')
  })

  it('omits shareUrlId when not provided', async () => {
    const { buildWixInstallUrl } = await import('@/lib/integrations/wix/install')
    const installUrl = buildWixInstallUrl({ callbackUrl: 'https://example.test/callback' })

    expect(new URL(installUrl).searchParams.has('shareUrlId')).toBe(false)
  })
})
