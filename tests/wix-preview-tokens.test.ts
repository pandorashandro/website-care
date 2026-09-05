import { describe, it, expect, beforeAll, vi } from 'vitest'
import { signWixTitlePreviewToken, verifyWixTitlePreviewToken, signWixMetaPreviewToken, verifyWixMetaPreviewToken } from '@/lib/fixes/preview-token'

/**
 * Wix V1 Prompt 2 — permanent regression coverage for items H, I, J, K of
 * this phase's test checklist: preview-token tampering, wrong-website
 * substitution, wrong-issue/field substitution, and resource-identity
 * mismatch must all be rejected. Uses the real signing key path (reads
 * FIX_PREVIEW_SIGNING_KEY) with a synthetic value set here — never a real
 * production secret.
 */

beforeAll(() => {
  if (!process.env.FIX_PREVIEW_SIGNING_KEY) {
    process.env.FIX_PREVIEW_SIGNING_KEY = 'a'.repeat(64)
  }
})

const baseTitlePayload = {
  issueId: 'issue-1',
  websiteId: 'website-1',
  pageUrl: 'https://example.wixsite.com/mysite/post/my-post',
  issueTitle: 'Missing page title',
  field: 'title' as const,
  itemType: 'blog_post' as const,
  itemId: 'item-abc',
  expectedCurrentTitle: '',
  proposedValue: 'A Good Title',
}

const baseMetaPayload = {
  issueId: 'issue-2',
  websiteId: 'website-1',
  pageUrl: 'https://example.wixsite.com/mysite/product-page/my-product',
  issueTitle: 'Missing meta description',
  field: 'meta_description' as const,
  itemType: 'stores_product' as const,
  itemId: 'item-xyz',
  expectedCurrentValue: '',
  proposedValue: 'A good description that is reasonably long for SEO purposes here.',
}

describe('Wix title preview token (wix-title-v1)', () => {
  it('round-trips a correctly signed token', () => {
    const token = signWixTitlePreviewToken(baseTitlePayload)
    const result = verifyWixTitlePreviewToken(token)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.itemId).toBe('item-abc')
      expect(result.payload.itemType).toBe('blog_post')
      expect(result.payload.proposedValue).toBe('A Good Title')
    }
  })

  it('rejects a tampered proposedValue (item H)', () => {
    const token = signWixTitlePreviewToken(baseTitlePayload)
    const [version, body, signature] = token.split('.')
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    decoded[9] = 'Attacker Injected Title' // proposedValue is index 9 in the canonical array
    const tamperedBody = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url')
    const tamperedToken = `${version}.${tamperedBody}.${signature}`

    const result = verifyWixTitlePreviewToken(tamperedToken)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_signature')
  })

  it('rejects a tampered websiteId — a token signed for one website cannot be silently redirected to another (item I)', () => {
    const token = signWixTitlePreviewToken(baseTitlePayload)
    const [version, body, signature] = token.split('.')
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    decoded[2] = 'attacker-owned-website-id' // websiteId is index 2
    const tamperedBody = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url')
    const tamperedToken = `${version}.${tamperedBody}.${signature}`

    const result = verifyWixTitlePreviewToken(tamperedToken)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_signature')
  })

  it('rejects a token whose field does not match "title" (item J — wrong field/family)', () => {
    const token = signWixMetaPreviewToken(baseMetaPayload)
    // A meta token must never verify successfully as a title token.
    const result = verifyWixTitlePreviewToken(token)
    expect(result.ok).toBe(false)
  })

  it('rejects an expired token — signed validly, then time advances past the 10-minute TTL', () => {
    vi.useFakeTimers()
    try {
      const token = signWixTitlePreviewToken(baseTitlePayload)
      expect(verifyWixTitlePreviewToken(token).ok).toBe(true) // fresh: still valid

      vi.advanceTimersByTime(11 * 60 * 1000) // past the 10-minute TTL

      const result = verifyWixTitlePreviewToken(token)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('expired')
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects malformed input without throwing', () => {
    expect(() => verifyWixTitlePreviewToken('not-a-real-token')).not.toThrow()
    expect(verifyWixTitlePreviewToken('not-a-real-token').ok).toBe(false)
  })
})

describe('Wix meta description preview token (wix-meta-v1)', () => {
  it('round-trips a correctly signed token', () => {
    const token = signWixMetaPreviewToken(baseMetaPayload)
    const result = verifyWixMetaPreviewToken(token)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.itemId).toBe('item-xyz')
      expect(result.payload.itemType).toBe('stores_product')
    }
  })

  it('rejects a title token verified as a meta token (item K — resource/kind mismatch)', () => {
    const token = signWixTitlePreviewToken(baseTitlePayload)
    const result = verifyWixMetaPreviewToken(token)
    expect(result.ok).toBe(false)
  })

  it('rejects a tampered itemId (resource identity substitution, item K)', () => {
    const token = signWixMetaPreviewToken(baseMetaPayload)
    const [version, body, signature] = token.split('.')
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    decoded[7] = 'attacker-controlled-item-id' // itemId is index 7
    const tamperedBody = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url')
    const tamperedToken = `${version}.${tamperedBody}.${signature}`

    const result = verifyWixMetaPreviewToken(tamperedToken)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_signature')
  })
})
