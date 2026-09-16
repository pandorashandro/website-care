import { describe, expect, it } from 'vitest'
import { ISSUE_DEFINITIONS } from '@/lib/scanner/issue-definitions'
import { LEGACY_CHECK_CLASSIFICATION } from '@/lib/technical-seo/legacy-classification'

describe('legacy check classification (Phase 26B, Checkpoint 2)', () => {
  it('classifies every legacy issue-definitions key (compile-time exhaustiveness backed by a runtime check too)', () => {
    const definitionKeys = Object.keys(ISSUE_DEFINITIONS).sort()
    const classifiedKeys = Object.keys(LEGACY_CHECK_CLASSIFICATION).sort()
    expect(classifiedKeys).toEqual(definitionKeys)
  })

  it('root cause check: canonical/robots/sitemap/indexability checks are classified TECHNICAL_SEO, not left under the legacy "seo" bucket\'s On-Page grouping', () => {
    const technicalSeoUnderLegacySeoType = ['missing_canonical', 'invalid_canonical', 'canonical_cross_domain', 'canonical_http', 'noindex', 'robots_blocks_site', 'sitemap_not_found', 'sitemap_invalid', 'sitemap_external_urls']

    for (const key of technicalSeoUnderLegacySeoType) {
      expect(ISSUE_DEFINITIONS[key as keyof typeof ISSUE_DEFINITIONS].type).toBe('seo') // confirms the legacy bucket really did lump these under generic "seo"
      expect(LEGACY_CHECK_CLASSIFICATION[key as keyof typeof LEGACY_CHECK_CLASSIFICATION]).toBe('TECHNICAL_SEO') // Phase 26B correctly reclassifies them
    }
  })

  it('on-page content checks (title/meta/heading) are classified ON_PAGE_SEO, not Technical SEO', () => {
    const onPageKeys = ['missing_title', 'title_too_short', 'title_too_long', 'missing_meta_description', 'meta_description_too_short', 'meta_description_too_long', 'missing_h1', 'multiple_h1']
    for (const key of onPageKeys) {
      expect(LEGACY_CHECK_CLASSIFICATION[key as keyof typeof LEGACY_CHECK_CLASSIFICATION]).toBe('ON_PAGE_SEO')
    }
  })

  it('legacy checks already tagged technical/accessibility/performance/content by the OLD report keep their correct Bible category', () => {
    expect(LEGACY_CHECK_CLASSIFICATION.server_error).toBe('TECHNICAL_SEO')
    expect(LEGACY_CHECK_CLASSIFICATION.missing_image_alt).toBe('ACCESSIBILITY')
    expect(LEGACY_CHECK_CLASSIFICATION.slow_response).toBe('PERFORMANCE')
    expect(LEGACY_CHECK_CLASSIFICATION.low_text_content).toBe('CONTENT')
  })

  it('quantifies the root cause: more legacy checks are genuinely Technical SEO than the old "technical"-typed subset alone', () => {
    const oldTechnicalTypeCount = Object.values(ISSUE_DEFINITIONS).filter((def) => def.type === 'technical').length
    const trueTechnicalSeoCount = Object.values(LEGACY_CHECK_CLASSIFICATION).filter((category) => category === 'TECHNICAL_SEO').length
    expect(trueTechnicalSeoCount).toBeGreaterThan(oldTechnicalTypeCount)
  })
})
