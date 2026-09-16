import { ISSUE_DEFINITIONS } from '@/lib/scanner/issue-definitions'

/**
 * Phase 26B, Checkpoint 2 — the machine-checked half of
 * docs/technical-seo-legacy-classification.md. Every legacy scanner check
 * (lib/scanner/issue-definitions.ts) is classified against the LOCKED
 * seven-category Bible, independent of the legacy report's own
 * {seo, technical, accessibility, performance, content} bucket labels —
 * this is the exact correction Phase 26B makes: the legacy `type: 'seo'`
 * bucket conflates Technical SEO (canonicals, noindex, robots, sitemap —
 * genuinely Technical SEO under the Bible) with On-Page SEO (titles, meta
 * descriptions, headings — a different, not-yet-built canonical engine),
 * which is the root cause this file documents machine-checkably (see the
 * docs file's own root-cause narrative for the full story).
 *
 * `as const satisfies Record<keyof typeof ISSUE_DEFINITIONS, LegacyCategory>`
 * makes it a compile error to add a new legacy issue-definitions key
 * without also classifying it here — nothing can silently stay
 * unclassified.
 */
export type LegacyCategory =
  | 'TECHNICAL_SEO'
  | 'ON_PAGE_SEO'
  | 'CONTENT'
  | 'SITE_ARCHITECTURE'
  | 'PERFORMANCE'
  | 'ACCESSIBILITY'
  | 'SECURITY'
  | 'LEGACY_DEPRECATED'

export const LEGACY_CHECK_CLASSIFICATION = {
  // --- Fetch/crawl/redirect health -> Technical SEO ---
  unreachable: 'TECHNICAL_SEO',
  page_not_found: 'TECHNICAL_SEO',
  page_gone: 'TECHNICAL_SEO',
  page_forbidden: 'TECHNICAL_SEO',
  server_error: 'TECHNICAL_SEO',
  page_rate_limited: 'TECHNICAL_SEO',
  unexpected_status: 'TECHNICAL_SEO',
  too_many_redirects: 'TECHNICAL_SEO',
  redirect_loop: 'TECHNICAL_SEO',
  long_redirect_chain: 'TECHNICAL_SEO',

  // --- HTTPS/protocol -> Technical SEO (the Bible's category 1 explicitly
  // lists "HTTPS issues"; a future Security engine owns BROADER website
  // security hygiene like headers/mixed-content beyond this protocol-health
  // layer, which no legacy check currently covers) ---
  no_https: 'TECHNICAL_SEO',
  https_downgrade: 'TECHNICAL_SEO',

  // --- Indexability/robots/sitemap/canonicals -> Technical SEO (these were
  // the legacy report's `type: 'seo'` checks that were WRONGLY lumped in
  // with On-Page SEO under one generic "SEO" score — this is the single
  // biggest source of the old Technical ~62 vs new Technical SEO ~97
  // discrepancy: half of what the Bible calls Technical SEO was never
  // counted in the legacy "Technical" bucket at all) ---
  robots_not_found: 'TECHNICAL_SEO',
  robots_unreachable: 'TECHNICAL_SEO',
  robots_blocks_site: 'TECHNICAL_SEO',
  sitemap_not_found: 'TECHNICAL_SEO',
  sitemap_unreachable: 'TECHNICAL_SEO',
  sitemap_invalid: 'TECHNICAL_SEO',
  sitemap_external_urls: 'TECHNICAL_SEO',
  noindex: 'TECHNICAL_SEO',
  missing_canonical: 'TECHNICAL_SEO',
  invalid_canonical: 'TECHNICAL_SEO',
  canonical_cross_domain: 'TECHNICAL_SEO',
  canonical_http: 'TECHNICAL_SEO',

  // --- On-page content optimization -> On-Page SEO (a future canonical
  // engine, NOT built in Phase 26B) ---
  missing_title: 'ON_PAGE_SEO',
  title_too_short: 'ON_PAGE_SEO',
  title_too_long: 'ON_PAGE_SEO',
  missing_meta_description: 'ON_PAGE_SEO',
  meta_description_too_short: 'ON_PAGE_SEO',
  meta_description_too_long: 'ON_PAGE_SEO',
  missing_h1: 'ON_PAGE_SEO',
  multiple_h1: 'ON_PAGE_SEO',
  missing_og_title: 'ON_PAGE_SEO',
  missing_og_description: 'ON_PAGE_SEO',

  // --- Accessibility (already correctly categorized by the legacy report;
  // no change needed) ---
  missing_image_alt: 'ACCESSIBILITY',
  missing_lang_attribute: 'ACCESSIBILITY',
  empty_links: 'ACCESSIBILITY',
  empty_buttons: 'ACCESSIBILITY',

  // --- Performance (already correctly categorized) ---
  slow_response: 'PERFORMANCE',
  large_html: 'PERFORMANCE',

  // --- Content (already correctly categorized) ---
  low_text_content: 'CONTENT',
} as const satisfies Record<keyof typeof ISSUE_DEFINITIONS, LegacyCategory>

/**
 * check-internal-links.ts's broken/redirect-problem issues are NOT in
 * ISSUE_DEFINITIONS (their titles are built dynamically per broken target,
 * e.g. "Broken internal link: /old-page") so they cannot be listed in the
 * exhaustive map above by key. They are still classified, by CONCEPT, here:
 * both belong to TECHNICAL_SEO under the Bible, and Phase 26 already
 * re-implements this exact concept natively (as
 * internal_link_to_broken_url / internal_link_to_redirected_url) against
 * richer, persisted crawl evidence — the dynamic legacy titles are not
 * migrated verbatim, they are superseded by that native implementation.
 */
export const DYNAMIC_LEGACY_CHECK_NOTES = [
  {
    titlePrefixes: ['Broken internal link:', 'Internal link points to a server-error page:', 'Internal link has a redirect problem:', 'Internal link could not be verified:'],
    classification: 'TECHNICAL_SEO' as LegacyCategory,
    note: 'Superseded by lib/technical-seo/checks/redirects.ts (internal_link_to_broken_url, internal_link_to_redirected_url) — not migrated verbatim, re-implemented against richer crawl evidence.',
  },
]
