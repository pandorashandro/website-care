import { describe, it, expect } from 'vitest'
import { evaluateShopifyFixCapability } from '@/lib/integrations/shopify/capabilities'
import { parseShopifyGrantedScopes, type ShopifyGrantedScopesResult } from '@/lib/integrations/shopify/scopes'

/**
 * Phase 21 — permanent regression coverage for Shopify's capability policy,
 * including the specific invariant this phase was asked to protect:
 * Product Image Alt must remain 'missing_scope' (never 'supported') until a
 * real future phase both requests read_files/write_files in OAuth AND
 * proves image identity — see Phase 20.1I/J's completion report. If this
 * test ever starts failing because Image Alt evaluates to 'supported', that
 * is a signal the OAuth scope list changed without the identity-proof work
 * that decision depends on.
 */

function scopesResult(granted: string[]): ShopifyGrantedScopesResult {
  return { ok: true, scopes: parseShopifyGrantedScopes(granted) }
}

const V1_GRANTED_SCOPES = ['read_content', 'write_content', 'read_products', 'write_products']

describe('evaluateShopifyFixCapability — title/meta_description (fully granted V1 scopes)', () => {
  it('supports title for all four resource types', () => {
    for (const resourceType of ['product', 'collection', 'page', 'article'] as const) {
      const result = evaluateShopifyFixCapability('title', { resourceContext: 'resolved', resourceType }, scopesResult(V1_GRANTED_SCOPES))
      expect(result.status).toBe('supported')
    }
  })

  it('supports meta_description for all four resource types', () => {
    for (const resourceType of ['product', 'collection', 'page', 'article'] as const) {
      const result = evaluateShopifyFixCapability('meta_description', { resourceContext: 'resolved', resourceType }, scopesResult(V1_GRANTED_SCOPES))
      expect(result.status).toBe('supported')
    }
  })

  it('never claims renderControlProven — that remains Phase 20.1G+\'s per-call-site verification job, never a capability-level claim', () => {
    const result = evaluateShopifyFixCapability('title', { resourceContext: 'resolved', resourceType: 'product' }, scopesResult(V1_GRANTED_SCOPES))
    expect(result.status).toBe('supported')
    if (result.status === 'supported') {
      expect(result.renderControlProven).toBe(false)
    }
  })
})

describe('evaluateShopifyFixCapability — Product Image Alt remains deferred', () => {
  it('is missing_scope with the CURRENT V1 OAuth scope set (read_files/write_files never requested)', () => {
    const result = evaluateShopifyFixCapability('image_alt', { resourceContext: 'resolved', resourceType: 'product' }, scopesResult(V1_GRANTED_SCOPES))
    expect(result.status).toBe('missing_scope')
    if (result.status === 'missing_scope') {
      expect(result.missingScopes).toEqual(expect.arrayContaining(['read_files', 'write_files']))
    }
  })

  it('is unsupported_resource for collection/page/article regardless of granted scopes', () => {
    const withFilesScopes = scopesResult([...V1_GRANTED_SCOPES, 'read_files', 'write_files'])
    for (const resourceType of ['collection', 'page', 'article'] as const) {
      const result = evaluateShopifyFixCapability('image_alt', { resourceContext: 'resolved', resourceType }, withFilesScopes)
      expect(result.status).toBe('unsupported_resource')
    }
  })

  it('would only become supported for Product if read_files/write_files were ever actually granted (documents the exact future trigger, does not endorse it)', () => {
    const withFilesScopes = scopesResult([...V1_GRANTED_SCOPES, 'read_files', 'write_files'])
    const result = evaluateShopifyFixCapability('image_alt', { resourceContext: 'resolved', resourceType: 'product' }, withFilesScopes)
    expect(result.status).toBe('supported')
  })
})

describe('evaluateShopifyFixCapability — fails closed on missing/partial scopes', () => {
  it('reports missing_scope when write scope is absent but read scope is present', () => {
    const result = evaluateShopifyFixCapability('title', { resourceContext: 'resolved', resourceType: 'product' }, scopesResult(['read_products']))
    expect(result.status).toBe('missing_scope')
  })

  it('reports missing_scope when no scopes are granted at all', () => {
    const result = evaluateShopifyFixCapability('title', { resourceContext: 'resolved', resourceType: 'page' }, scopesResult([]))
    expect(result.status).toBe('missing_scope')
  })
})

describe('evaluateShopifyFixCapability — fails closed on connection/scope-fetch problems', () => {
  it('reports connection_unhealthy for an unauthorized scopes fetch', () => {
    const result = evaluateShopifyFixCapability(
      'title',
      { resourceContext: 'resolved', resourceType: 'product' },
      { ok: false, reason: 'unauthorized' }
    )
    expect(result.status).toBe('connection_unhealthy')
  })

  it('reports connection_unhealthy for a network/timeout/blocked scopes fetch', () => {
    for (const reason of ['blocked', 'timeout', 'network', 'unexpected_status'] as const) {
      const result = evaluateShopifyFixCapability('title', { resourceContext: 'resolved', resourceType: 'product' }, { ok: false, reason })
      expect(result.status).toBe('connection_unhealthy')
    }
  })

  it('reports malformed_scope_state for a malformed/graphql-error scopes fetch (never coerced to unhealthy or supported)', () => {
    for (const reason of ['malformed_response', 'graphql_errors'] as const) {
      const result = evaluateShopifyFixCapability('title', { resourceContext: 'resolved', resourceType: 'product' }, { ok: false, reason })
      expect(result.status).toBe('malformed_scope_state')
    }
  })

  it('reports localized_context_unsupported for a localized/market-specific route, independent of scopes', () => {
    const result = evaluateShopifyFixCapability('title', { resourceContext: 'localized_unsupported' }, scopesResult(V1_GRANTED_SCOPES))
    expect(result.status).toBe('localized_context_unsupported')
  })
})
