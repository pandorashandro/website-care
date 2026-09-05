import { describe, it, expect } from 'vitest'
import { evaluateFixability } from '@/lib/fixes/fixability'
import { evaluateShopifyIssueFixability } from '@/lib/integrations/shopify/issue-fixability'
import { resolveRequiredWordPressCapability } from '@/lib/integrations/wordpress/adapter'
import { parseShopifyGrantedScopes } from '@/lib/integrations/shopify/scopes'
import type { IntegrationCapabilitySnapshot } from '@/lib/integrations/platform'

/**
 * Phase 21 — permanent regression coverage for the shared safety semantics
 * both platforms' fixability layers must uphold: 'unknown' capability state
 * is never treated as 'available', an unrecognized issue title never
 * defaults to an assisted fix, and a not-connected/unhealthy integration
 * never grants capability regardless of what the static per-issue rule
 * would otherwise allow.
 */

const AVAILABLE_SNAPSHOT: IntegrationCapabilitySnapshot = { edit_content: 'available', upload_media: 'available' }
const UNKNOWN_SNAPSHOT: IntegrationCapabilitySnapshot = { edit_content: 'unknown', upload_media: 'unknown' }
const UNAVAILABLE_SNAPSHOT: IntegrationCapabilitySnapshot = { edit_content: 'unavailable', upload_media: 'unavailable' }

describe('evaluateFixability (WordPress-driven, but the engine itself is platform-agnostic)', () => {
  it('an unrecognized issue title never defaults to assisted — it is unavailable', () => {
    const result = evaluateFixability({
      issueTitle: 'Some issue type that does not exist',
      integrationDetected: true,
      connectionState: 'connected',
      capabilities: AVAILABLE_SNAPSHOT,
    })
    expect(result.level).toBe('unavailable')
  })

  it('a known assisted-candidate issue downgrades to manual when not connected', () => {
    const result = evaluateFixability({
      issueTitle: 'Missing page title',
      integrationDetected: false,
      connectionState: 'not_connected',
      capabilities: null,
    })
    expect(result.level).not.toBe('assisted')
  })

  it('needs_attention connection state never yields assisted, even with a capability snapshot present', () => {
    const result = evaluateFixability({
      issueTitle: 'Missing page title',
      integrationDetected: true,
      connectionState: 'needs_attention',
      capabilities: AVAILABLE_SNAPSHOT,
    })
    expect(result.level).not.toBe('assisted')
  })

  it('an unknown capability value is never treated as available', () => {
    const result = evaluateFixability({
      issueTitle: 'Missing page title',
      integrationDetected: true,
      connectionState: 'connected',
      capabilities: UNKNOWN_SNAPSHOT,
    })
    expect(result.level).not.toBe('assisted')
  })

  it('an unavailable capability value reports unavailable, never assisted or a silent downgrade to manual', () => {
    const result = evaluateFixability({
      issueTitle: 'Missing page title',
      integrationDetected: true,
      connectionState: 'connected',
      capabilities: UNAVAILABLE_SNAPSHOT,
    })
    expect(result.level).toBe('unavailable')
  })

  it('a fully connected, available capability DOES yield assisted (positive control — confirms the test setup itself is meaningful)', () => {
    const result = evaluateFixability({
      issueTitle: 'Missing page title',
      integrationDetected: true,
      connectionState: 'connected',
      capabilities: AVAILABLE_SNAPSHOT,
    })
    expect(result.level).toBe('assisted')
  })
})

describe('evaluateShopifyIssueFixability — same fail-closed contract, independently implemented', () => {
  it('returns null (defers to the caller\'s existing result) for an issue type Shopify has no opinion on', () => {
    expect(evaluateShopifyIssueFixability({ issueTitle: 'Missing H1 heading', connectionState: 'connected', grantedScopes: null })).toBeNull()
    expect(evaluateShopifyIssueFixability({ issueTitle: 'Images missing alt text', connectionState: 'connected', grantedScopes: null })).toBeNull()
  })

  it('never returns assisted when not connected', () => {
    const result = evaluateShopifyIssueFixability({ issueTitle: 'Missing page title', connectionState: 'not_connected', grantedScopes: null })
    expect(result?.level).not.toBe('assisted')
  })

  it('never returns assisted when connection needs attention', () => {
    const result = evaluateShopifyIssueFixability({ issueTitle: 'Missing page title', connectionState: 'needs_attention', grantedScopes: null })
    expect(result?.level).toBe('unavailable')
  })

  it('never returns assisted for a title/meta issue when connected but lacking any write scope', () => {
    const result = evaluateShopifyIssueFixability({
      issueTitle: 'Missing page title',
      connectionState: 'connected',
      grantedScopes: parseShopifyGrantedScopes(['read_products', 'read_content']),
    })
    expect(result?.level).toBe('unavailable')
  })
})

describe('resolveRequiredWordPressCapability (WordPress adapter — used to build the snapshot fixability consumes)', () => {
  it('never resolves edit_content to available unless at least one of canEditPages/canEditPosts is available', () => {
    expect(
      resolveRequiredWordPressCapability('edit_content', {
        canEditPages: 'unavailable',
        canEditPosts: 'unavailable',
        canPublishPosts: 'unavailable',
        canUploadMedia: 'unavailable',
      })
    ).toBe('unavailable')
  })

  it('resolves edit_content to unknown (never available) when both are unknown', () => {
    expect(
      resolveRequiredWordPressCapability('edit_content', {
        canEditPages: 'unknown',
        canEditPosts: 'unknown',
        canPublishPosts: 'unknown',
        canUploadMedia: 'unknown',
      })
    ).toBe('unknown')
  })

  it('resolves upload_media directly from canUploadMedia, independent of edit capabilities', () => {
    expect(
      resolveRequiredWordPressCapability('upload_media', {
        canEditPages: 'available',
        canEditPosts: 'available',
        canPublishPosts: 'available',
        canUploadMedia: 'unavailable',
      })
    ).toBe('unavailable')
  })
})
