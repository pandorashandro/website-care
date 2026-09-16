import type { CheckKey, Actionability } from './types'

/**
 * Phase 26B, Checkpoint 7/8 — static, per-check actionability
 * classification. Renamed from Phase 26A's fixability.ts (same concept,
 * canonical vocabulary corrected: safe_fix / prepared_fix / guided_fix /
 * developer_required / monitor).
 *
 * Deliberately NOT integration-connection-aware like lib/fixes/fixability.ts
 * (which gates 'assisted' on a live WordPress/Shopify/Wix connection): this
 * phase implements no new fix of any kind, for any check, on any platform.
 * Every classification below is either 'guided_fix', 'developer_required',
 * or 'monitor' — never 'safe_fix' or 'prepared_fix' — because no CURRENT
 * backend capability can execute any of these changes automatically or as a
 * prepared/approval-gated diff. Claiming otherwise would violate this
 * phase's own "do not classify based on wishful future capabilities"
 * instruction (Checkpoint 7) and "do not falsely mark a Technical SEO issue
 * SAFE_FIX simply because it would be nice to automate" (Checkpoint 8).
 * Existing WordPress/Shopify/Wix capability registries (lib/fixes/,
 * lib/integrations/) remain the sole source of truth for what can actually
 * execute; Phase 30 is responsible for expanding real execution coverage
 * and, with it, for revisiting these classifications where a real backend
 * capability comes to exist — this architecture is built so Phase 30 can
 * attach an executor to a finding without redesigning the finding itself.
 *
 * `as const satisfies Record<CheckKey, Actionability>` makes it a compile
 * error to add a new CheckKey (types.ts) without also classifying it here —
 * mirrors lib/fixes/fixability.ts's own exhaustiveness pattern.
 */
export const CHECK_ACTIONABILITY = {
  fetch_failed: 'developer_required',
  redirect_loop_page: 'developer_required',
  excessive_redirect_chain: 'developer_required',
  internal_page_4xx: 'guided_fix',
  internal_page_5xx: 'developer_required',

  noindex_page: 'guided_fix',
  indexable_page_blocked_by_robots: 'guided_fix',
  conflicting_indexability_signals: 'guided_fix',
  important_page_non_indexable: 'guided_fix',

  missing_canonical: 'guided_fix',
  invalid_canonical: 'guided_fix',
  canonical_cross_domain: 'monitor',
  canonical_http_downgrade: 'guided_fix',
  canonical_target_error: 'guided_fix',
  canonical_target_non_indexable: 'guided_fix',

  internal_link_to_redirected_url: 'guided_fix',
  internal_link_to_broken_url: 'guided_fix',
  https_downgrade_redirect: 'developer_required',

  robots_unreachable: 'developer_required',
  robots_blocks_site: 'guided_fix',

  sitemap_unavailable: 'guided_fix',
  sitemap_empty: 'guided_fix',
  sitemap_contains_error_url: 'guided_fix',
  sitemap_contains_noindex_url: 'guided_fix',
  sitemap_contains_blocked_url: 'guided_fix',
  important_page_missing_from_sitemap: 'guided_fix',

  mixed_protocol_internal_links: 'guided_fix',

  empty_or_tiny_page: 'monitor',

  structured_data_invalid: 'guided_fix',

  hreflang_invalid_code: 'guided_fix',
  hreflang_target_error: 'guided_fix',
  hreflang_missing_reciprocal: 'monitor',

  widespread_non_indexable_pages: 'developer_required',
  widespread_fetch_failures: 'developer_required',
} as const satisfies Record<CheckKey, Actionability>

export function getActionability(checkKey: CheckKey): Actionability {
  return CHECK_ACTIONABILITY[checkKey]
}
