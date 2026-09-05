import { describe, it, expect } from 'vitest'
import { evaluateWixFixCapability } from '@/lib/integrations/wix/capabilities'

/**
 * Wix V1 Prompt 1 — permanent regression coverage for Wix's capability
 * policy: only title/meta_description are ever evaluated (H1/Image Alt
 * are unrepresentable — see lib/integrations/wix/capabilities.ts's module
 * doc comment), and a non-primary-language resource must fail closed
 * rather than attempt a write the Item SEO Tags API would reject.
 */
describe('evaluateWixFixCapability', () => {
  it('supports title for blog_post in the primary language', () => {
    const result = evaluateWixFixCapability('title', { resourceType: 'blog_post', isPrimaryLanguage: true })
    expect(result.status).toBe('supported')
  })

  it('supports meta_description for stores_product in the primary language', () => {
    const result = evaluateWixFixCapability('meta_description', { resourceType: 'stores_product', isPrimaryLanguage: true })
    expect(result.status).toBe('supported')
  })

  it('fails closed with language_not_supported for a non-primary-language resource', () => {
    const titleResult = evaluateWixFixCapability('title', { resourceType: 'blog_post', isPrimaryLanguage: false })
    const metaResult = evaluateWixFixCapability('meta_description', { resourceType: 'stores_product', isPrimaryLanguage: false })

    expect(titleResult.status).toBe('language_not_supported')
    expect(metaResult.status).toBe('language_not_supported')
  })

  it('never returns a status other than supported/language_not_supported (no missing_scope/unsupported_resource exists in this model)', () => {
    for (const resourceType of ['blog_post', 'stores_product'] as const) {
      for (const isPrimaryLanguage of [true, false]) {
        const result = evaluateWixFixCapability('title', { resourceType, isPrimaryLanguage })
        expect(['supported', 'language_not_supported']).toContain(result.status)
      }
    }
  })
})
