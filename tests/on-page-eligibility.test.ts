import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isOnPageEligiblePage } from '@/lib/on-page/eligibility'
import { makePage } from './helpers/architecture-fixtures'

/**
 * Phase 28 — thin wiring test for lib/on-page/eligibility.ts. Full rule
 * coverage (noindex, cross-canonical, non-2xx, non-HTML, failed fetch,
 * legitimate query-string pages, unparseable canonical) already lives in
 * tests/architecture-eligibility.test.ts against the identical underlying
 * lib/category-engine/eligibility.ts predicate — this file only confirms
 * On-Page SEO's own wrapper delegates correctly, without re-testing every
 * boundary a second time.
 */
describe('isOnPageEligiblePage', () => {
  it('a normal, successfully-fetched, indexable, self-canonical HTML page is eligible', () => {
    expect(isOnPageEligiblePage(makePage({ url: 'https://example.com/solutions' }))).toBe(true)
  })

  it('a page marked noindex is not eligible', () => {
    expect(isOnPageEligiblePage(makePage({ url: 'https://example.com/utility', noindex: true }))).toBe(false)
  })

  it('a page whose canonical points at a different URL is not eligible', () => {
    const page = makePage({ url: 'https://example.com/utility?x=1', canonical_url: 'https://example.com/real-page' })
    expect(isOnPageEligiblePage(page)).toBe(false)
  })

  it('a page that failed to fetch is not eligible', () => {
    const page = makePage({ url: 'https://example.com/gone', status: 'failed', http_status: null })
    expect(isOnPageEligiblePage(page)).toBe(false)
  })

  it('a legitimate query-string page with no noindex/cross-canonical remains eligible', () => {
    const page = makePage({ url: 'https://example.com/products?category=shoes' })
    expect(isOnPageEligiblePage(page)).toBe(true)
  })

  /**
   * Phase 28 real-world evidence validation, Observation 1 — the Bespoke
   * analysis included page-builder template/utility resources (a WPR mega
   * menu template query string, Elementor theme-builder header/footer
   * entries) in a duplicate_title finding. These example URL SHAPES are
   * used here only as realistic test data illustrating a GENERAL class of
   * page-builder resource — never as a hardcoded exclusion rule in
   * production code (grep lib/on-page and lib/category-engine: neither
   * "wpr_templates", "elementor-hf", nor any other CMS-specific string
   * appears anywhere in the eligibility predicate itself). This test
   * documents and locks in the audited conclusion: current persisted
   * evidence (status/http_status/content_type/noindex/canonical_url) has NO
   * reliable, general signal that distinguishes these resources from
   * ordinary content pages when the site itself does not mark them noindex
   * or cross-canonical -- so they remain eligible, which is the CORRECT,
   * conservative behavior per this repo's own "prefer keeping over
   * guessing" rule, not a bug to silently patch with a URL-pattern hack.
   */
  it('a page-builder template/utility URL with no noindex and no cross-canonical remains eligible — no URL-pattern exclusion exists', () => {
    const templateUrls = [
      'https://example.com/?wpr_templates=user-header-custom-header',
      'https://example.com/elementor-hf/7633',
      'https://example.com/elementor-hf/header-revamp',
    ]

    for (const url of templateUrls) {
      const page = makePage({ url, title: 'Tailored Marketing and Systems Integrations Services' })
      expect(isOnPageEligiblePage(page)).toBe(true)
    }
  })

  it('the SAME template/utility URL becomes ineligible the moment the site itself asserts noindex or a cross-canonical — proving exclusion is evidence-driven, not URL-shape-driven', () => {
    const noindexed = makePage({ url: 'https://example.com/elementor-hf/7633', noindex: true })
    const crossCanonical = makePage({ url: 'https://example.com/?wpr_templates=user-header-custom-header', canonical_url: 'https://example.com/' })

    expect(isOnPageEligiblePage(noindexed)).toBe(false)
    expect(isOnPageEligiblePage(crossCanonical)).toBe(false)
  })

  it('the eligibility EXECUTABLE CODE contains no CMS/platform-specific string — a permanent guard against reintroducing a URL-pattern hack', () => {
    // Comments are allowed to mention real-world examples by name (e.g.
    // "WordPress mega-menu" as motivating context, in both files' own doc
    // comments) — this test strips comments first so it checks the actual
    // LOGIC (conditionals, string comparisons, regexes) rather than prose,
    // which is the thing that must never special-case a platform.
    const bannedSubstrings = ['wordpress', 'elementor', 'wpr_', 'shopify', 'wix', 'bespoke', 'squarespace', 'webflow']
    const sourceFiles = [
      join(process.cwd(), 'lib', 'on-page', 'eligibility.ts'),
      join(process.cwd(), 'lib', 'category-engine', 'eligibility.ts'),
    ]

    for (const filePath of sourceFiles) {
      const raw = readFileSync(filePath, 'utf-8')
      const codeOnly = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').toLowerCase()
      for (const banned of bannedSubstrings) {
        expect(codeOnly).not.toContain(banned)
      }
    }
  })
})
