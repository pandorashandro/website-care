# Legacy check classification (Phase 26B, Checkpoint 2)

This document explains, and cross-references, the machine-checked classification in [`lib/technical-seo/legacy-classification.ts`](../lib/technical-seo/legacy-classification.ts) (`LEGACY_CHECK_CLASSIFICATION`, `as const satisfies Record<keyof typeof ISSUE_DEFINITIONS, LegacyCategory>` — a compile error if any legacy check is left unclassified). It is the artifact Phase 26B's Checkpoint 2 calls for: every legacy scanner check, classified against the **locked seven-category Bible**, independent of the legacy report's own five-bucket model.

## Root cause of the "Technical 62 vs 97" discrepancy

The legacy scanner (`lib/scanner/issue-definitions.ts`, scored by `lib/scanner/calculate-health-score.ts`) tags every check with one of five `type` values: `seo`, `technical`, `accessibility`, `performance`, `content`. The Overview's old "Technical" tile was `categories.technical` — computed **only** from checks tagged `type: 'technical'`.

That five-bucket model predates the seven-category Bible and does not map onto it 1:1. Concretely:

- Checks tagged `type: 'technical'` (fetch/HTTP/redirect health — `unreachable`, `page_not_found`, `server_error`, `redirect_loop`, `no_https`, `robots_unreachable`, `sitemap_unreachable`, etc.) **are** genuinely Technical SEO under the Bible. These fed the old "Technical" score.
- But checks tagged `type: 'seo'` that are **also** genuinely Technical SEO under the Bible — `missing_canonical`, `invalid_canonical`, `canonical_cross_domain`, `canonical_http`, `noindex`, `robots_blocks_site`, `sitemap_not_found`, `sitemap_invalid`, `sitemap_external_urls` — were **never counted in the "Technical" bucket at all**. They were folded into the legacy report's generic "SEO" score instead, alongside genuinely different on-page concerns (`missing_title`, `missing_meta_description`, `missing_h1`, etc.).

So the old "Technical ≈ 62" reflected only half of what Technical SEO actually is — the HTTP/fetch/redirect layer — while completely excluding canonicals, indexability, robots, and sitemap health, which is exactly the evidence the Phase 26 crawler-based engine analyzes in full. `tests/technical-seo-legacy-classification.test.ts` quantifies this directly: strictly more legacy checks are genuinely Technical SEO under the Bible than were ever tagged `type: 'technical'` by the old model.

A secondary, compounding factor: the legacy scanner and the Phase 25 crawler are two different crawls of the website (the legacy scanner does its own synchronous, ≤20-page BFS crawl per manual scan; the Phase 25/26 crawler does a persisted, budget-driven crawl, e.g. up to 30 pages on the Free plan) — so even setting the categorization problem aside, the two systems were never guaranteed to observe the exact same pages. Phase 26B's fix (Checkpoint 3) does not attempt to unify the two crawls; it makes Technical SEO **stop being computed from the legacy report at all** — Overview now reads the same persisted Technical SEO analysis the dedicated page reads, so there is exactly one number, one source, forever in agreement with itself.

## Classification table

| Legacy check key | Old legacy `type` | Bible category | Notes |
|---|---|---|---|
| `unreachable` | technical | TECHNICAL_SEO | |
| `page_not_found` | technical | TECHNICAL_SEO | |
| `page_gone` | technical | TECHNICAL_SEO | |
| `page_forbidden` | technical | TECHNICAL_SEO | |
| `server_error` | technical | TECHNICAL_SEO | |
| `page_rate_limited` | technical | TECHNICAL_SEO | |
| `unexpected_status` | technical | TECHNICAL_SEO | |
| `too_many_redirects` | technical | TECHNICAL_SEO | |
| `redirect_loop` | technical | TECHNICAL_SEO | |
| `long_redirect_chain` | technical | TECHNICAL_SEO | |
| `no_https` | technical | TECHNICAL_SEO | Bible category 1 explicitly lists "HTTPS issues"; a future Security engine owns broader hygiene (headers, mixed content) not yet covered by any legacy check. |
| `https_downgrade` | technical | TECHNICAL_SEO | |
| `robots_not_found` | technical | TECHNICAL_SEO | |
| `robots_unreachable` | technical | TECHNICAL_SEO | |
| `robots_blocks_site` | **seo** | TECHNICAL_SEO | Miscategorized under legacy "SEO" — a root-cause contributor. |
| `sitemap_not_found` | **seo** | TECHNICAL_SEO | Miscategorized under legacy "SEO" — a root-cause contributor. |
| `sitemap_unreachable` | technical | TECHNICAL_SEO | |
| `sitemap_invalid` | **seo** | TECHNICAL_SEO | Miscategorized under legacy "SEO" — a root-cause contributor. |
| `sitemap_external_urls` | **seo** | TECHNICAL_SEO | Miscategorized under legacy "SEO" — a root-cause contributor. |
| `noindex` | **seo** | TECHNICAL_SEO | Miscategorized under legacy "SEO" — a root-cause contributor. |
| `missing_canonical` | **seo** | TECHNICAL_SEO | Miscategorized under legacy "SEO" — a root-cause contributor. |
| `invalid_canonical` | **seo** | TECHNICAL_SEO | Miscategorized under legacy "SEO" — a root-cause contributor. |
| `canonical_cross_domain` | **seo** | TECHNICAL_SEO | Miscategorized under legacy "SEO" — a root-cause contributor. |
| `canonical_http` | **seo** | TECHNICAL_SEO | Miscategorized under legacy "SEO" — a root-cause contributor; migrated into the canonical engine as `canonical_http_downgrade`. |
| `missing_title` | seo | ON_PAGE_SEO | Correctly NOT Technical SEO; belongs to a future On-Page SEO engine. |
| `title_too_short` | seo | ON_PAGE_SEO | |
| `title_too_long` | seo | ON_PAGE_SEO | |
| `missing_meta_description` | seo | ON_PAGE_SEO | |
| `meta_description_too_short` | seo | ON_PAGE_SEO | |
| `meta_description_too_long` | seo | ON_PAGE_SEO | |
| `missing_h1` | seo | ON_PAGE_SEO | |
| `multiple_h1` | seo | ON_PAGE_SEO | |
| `missing_og_title` | seo | ON_PAGE_SEO | |
| `missing_og_description` | seo | ON_PAGE_SEO | |
| `missing_image_alt` | accessibility | ACCESSIBILITY | Already correctly categorized; unchanged. |
| `missing_lang_attribute` | accessibility | ACCESSIBILITY | Already correctly categorized; unchanged. |
| `empty_links` | accessibility | ACCESSIBILITY | Already correctly categorized; unchanged. |
| `empty_buttons` | accessibility | ACCESSIBILITY | Already correctly categorized; unchanged. |
| `slow_response` | performance | PERFORMANCE | Already correctly categorized; unchanged. |
| `large_html` | performance | PERFORMANCE | Already correctly categorized; unchanged. |
| `low_text_content` | content | CONTENT | Already correctly categorized; unchanged. |

Dynamically-titled checks from `lib/scanner/check-internal-links.ts` (e.g. "Broken internal link: /old-page") are not in `ISSUE_DEFINITIONS` and so cannot appear in the exhaustive map above by key — see `DYNAMIC_LEGACY_CHECK_NOTES` in the same file. Both dynamic title families are TECHNICAL_SEO, and are **superseded, not migrated verbatim**, by `lib/technical-seo/checks/redirects.ts`'s `internal_link_to_broken_url`/`internal_link_to_redirected_url`, which run against richer, persisted crawl evidence (source page, current target, HTTP state, final destination) rather than a live per-scan fetch.

No legacy check is classified `SITE_ARCHITECTURE`, `SECURITY`, or `LEGACY_DEPRECATED` — the legacy scanner has no check that genuinely belongs to a future Site Architecture or Security engine, and nothing here is deprecated (no historical data is migrated or destroyed — see the Phase 26B migration's own comments).

## What this means going forward

- **`scans`/`issues`** (the legacy scanner's own tables) are untouched. The Overview's remaining `seo`/`accessibility`/`performance`/`content` tiles keep reading from them exactly as before, unchanged, until their own canonical engines are built (explicitly out of scope for Phase 26B).
- **`categories.technical` (the legacy score) is no longer read by the Overview's `CategoryScoreGrid`** — the grid's own "Technical SEO" tile is sourced from the canonical engine instead (`getTechnicalSeoCategorySummary`, see `docs/category-engine-contract.md`), rendered inside the same Category Health grid as the other four legacy tiles, not as a separate card.
- Every check identified above as genuinely Technical SEO has either already been re-implemented natively in `lib/technical-seo/checks/` against crawl evidence (canonicals, robots, sitemap, indexability, redirects, HTTP/fetch health), or is covered by the acceptance matrix (`docs/technical-seo-acceptance-matrix.md`) as an explicit, reasoned decision.
