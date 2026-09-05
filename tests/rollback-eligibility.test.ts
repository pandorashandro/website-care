import { describe, it, expect } from 'vitest'
import { isRollbackEligibleByShape, isShopifyRollbackEligibleByShape } from '@/app/dashboard/websites/[id]/fix-history'

/**
 * Phase 21 — permanent regression coverage for the single most dangerous
 * shape in the whole Undo system: WordPress and Shopify both use the
 * literal resource_type value 'page' to mean two UNRELATED resources (a
 * WordPress Page vs. a Shopify Page). isRollbackEligibleByShape and
 * isShopifyRollbackEligibleByShape are deliberately separate functions,
 * each gating on `platform` FIRST — if that branch were ever removed or
 * merged, a Shopify 'page' row could be misread as WordPress-eligible (or
 * vice versa), which would let Undo target the wrong platform's write path
 * entirely. These tests fail loudly if that gate is ever weakened.
 */

const baseWordPressRow = {
  platform: 'wordpress',
  field: 'title' as const,
  resource_type: 'page',
  resource_id: 123,
  previous_value: 'Old Title',
  image_url: null,
  write_strategy: null,
}

const baseShopifyRow = {
  platform: 'shopify',
  field: 'title' as const,
  resource_type: 'page',
  resource_gid: 'gid://shopify/OnlineStorePage/123',
  previous_value: 'Old Title',
}

describe('WordPress rollback eligibility (isRollbackEligibleByShape)', () => {
  it('accepts a well-formed WordPress title row', () => {
    expect(isRollbackEligibleByShape(baseWordPressRow)).toBe(true)
  })

  it('rejects a Shopify row even though resource_type is the same literal "page"', () => {
    // The critical collision case: a Shopify 'page' row must NEVER be
    // treated as WordPress-eligible just because resource_type matches.
    expect(
      isRollbackEligibleByShape({
        platform: 'shopify',
        field: 'title',
        resource_type: 'page',
        resource_id: null,
        previous_value: 'Old Title',
        image_url: null,
        write_strategy: null,
      })
    ).toBe(false)
  })

  it('rejects an unknown platform value (fail closed, never guessed)', () => {
    expect(isRollbackEligibleByShape({ ...baseWordPressRow, platform: 'wix' })).toBe(false)
  })

  it('rejects a Shopify resource_type (product/collection/article) even under platform wordpress', () => {
    for (const resourceType of ['product', 'collection', 'article']) {
      expect(isRollbackEligibleByShape({ ...baseWordPressRow, resource_type: resourceType })).toBe(false)
    }
  })

  it('rejects a null previous_value (ambiguous — never guessed)', () => {
    expect(isRollbackEligibleByShape({ ...baseWordPressRow, previous_value: null })).toBe(false)
  })

  it('rejects a non-numeric resource_id', () => {
    expect(isRollbackEligibleByShape({ ...baseWordPressRow, resource_id: null })).toBe(false)
  })

  it('rejects meta_description rows without a recognized write_strategy', () => {
    expect(isRollbackEligibleByShape({ ...baseWordPressRow, field: 'meta_description' as const, write_strategy: null })).toBe(false)
  })

  it('accepts meta_description rows with a recognized write_strategy', () => {
    expect(
      isRollbackEligibleByShape({ ...baseWordPressRow, field: 'meta_description' as const, write_strategy: 'yoast_meta_description' })
    ).toBe(true)
  })
})

describe('Shopify rollback eligibility (isShopifyRollbackEligibleByShape)', () => {
  it('accepts a well-formed Shopify title row', () => {
    expect(isShopifyRollbackEligibleByShape(baseShopifyRow)).toBe(true)
  })

  it('rejects a WordPress row even with a Shopify-looking resource_type', () => {
    expect(
      isShopifyRollbackEligibleByShape({
        platform: 'wordpress',
        field: 'title',
        resource_type: 'product',
        resource_gid: 'gid://shopify/Product/123',
        previous_value: 'Old Title',
      })
    ).toBe(false)
  })

  it('rejects h1 and image_alt fields — Shopify has no direct fix for either', () => {
    expect(isShopifyRollbackEligibleByShape({ ...baseShopifyRow, field: 'h1' })).toBe(false)
    expect(isShopifyRollbackEligibleByShape({ ...baseShopifyRow, field: 'image_alt' })).toBe(false)
  })

  it('accepts every supported Shopify resource_type', () => {
    for (const resourceType of ['product', 'collection', 'page', 'article']) {
      expect(isShopifyRollbackEligibleByShape({ ...baseShopifyRow, resource_type: resourceType })).toBe(true)
    }
  })

  it('rejects an unsupported resource_type', () => {
    expect(isShopifyRollbackEligibleByShape({ ...baseShopifyRow, resource_type: 'post' })).toBe(false)
  })

  it('rejects a missing/null resource_gid (fail closed — Shopify identity requires a GID, never a numeric id)', () => {
    expect(isShopifyRollbackEligibleByShape({ ...baseShopifyRow, resource_gid: null })).toBe(false)
  })

  it('rejects a null previous_value', () => {
    expect(isShopifyRollbackEligibleByShape({ ...baseShopifyRow, previous_value: null })).toBe(false)
  })
})
