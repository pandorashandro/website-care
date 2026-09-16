# Technical SEO acceptance matrix (Phase 26B, Checkpoint 4)

The product/engineering contract for every Technical SEO check: what evidence it needs, how it decides, where it stops (false-positive boundary), how severity/confidence are set, what "current" and "desired" state mean for it, how actionable it is, and how a fix could eventually be verified. `check key` matches `lib/technical-seo/types.ts`'s `CheckKey` exactly; `severity basis` is the analyzer's `baseSeverity` before `lib/technical-seo/severity.ts`'s confidence-cap/spread-escalation adjustment (see that file for the adjustment rules themselves, and `docs/technical-seo-score-explainability.md` for how severity feeds the score).

All 34 checks below are **implemented now**. Checkpoint 5's coverage audit items that are **intentionally deferred** are listed at the end, with reasons.

Legend for **supported platform execution**: today, no Technical SEO check has a real write-capable backend on any connected platform (WordPress/Shopify/Wix capabilities cover title/meta/H1/image-alt only — see `lib/fixes/fixability.ts`) — so this column is `none` for every check below. It exists so Phase 30 has an explicit place to record when that changes, without touching the finding model again.

---

## A. Crawlability / fetch health

### `fetch_failed`
- **Area**: HTTP/fetch health
- **Evidence required**: `crawl_pages.status = 'failed'`, `error_reason` (network/timeout/blocked/malformed_url)
- **Detection logic**: page never obtained an HTTP response
- **False-positive boundary**: excludes `redirect_loop_page`/`excessive_redirect_chain`'s own error reasons (they get dedicated checks)
- **Severity basis**: high
- **Confidence basis**: high (explicit failure)
- **Affected asset**: the page itself
- **Current state**: error reason
- **Desired state**: none (no confident replacement without human judgment)
- **Remediation type**: none (informational)
- **Actionability**: developer_required
- **Verification method**: page returns a real HTTP response on re-crawl
- **Platform execution**: none

### `redirect_loop_page`
- **Evidence**: `status='failed'`, `error_reason='redirect_loop'`
- **Detection**: fetchPage detected a repeated URL in its own redirect chain
- **False-positive boundary**: n/a — a genuine loop, deterministically detected
- **Severity/confidence**: high / high
- **Affected asset**: the page
- **Current/desired state**: "in a redirect loop" / none
- **Remediation type**: none (developer fix)
- **Actionability**: developer_required
- **Verification**: page resolves to a final URL on re-crawl
- **Platform execution**: none

### `excessive_redirect_chain`
- **Evidence**: `redirect_count >= 3` (completed) or `error_reason='too_many_redirects'` (failed)
- **Detection**: hop count threshold, matching legacy `long_redirect_chain`'s own threshold
- **False-positive boundary**: pages with 1-2 redirects are not flagged
- **Severity/confidence**: medium / high
- **Affected asset**: the page
- **Current state**: redirect count
- **Desired state**: none (exact ideal chain isn't inferable)
- **Remediation type**: none
- **Actionability**: developer_required
- **Verification**: `redirect_count` drops below 3 on re-crawl
- **Platform execution**: none

### `internal_page_4xx`
- **Evidence**: `status='completed'`, `http_status` 400-499
- **Detection**: split into a 404-specific instance (high) and other-4xx instance (medium); merged by `aggregate.ts` into one finding at the higher severity
- **False-positive boundary**: only genuinely non-2xx completed fetches
- **Severity/confidence**: high (404) / medium (other 4xx); high confidence
- **Affected asset**: the page
- **Current state**: HTTP status
- **Desired state**: none (restore vs. redirect is a business decision)
- **Remediation type**: none
- **Actionability**: guided_fix
- **Verification**: page returns 2xx on re-crawl
- **Platform execution**: none

### `internal_page_5xx`
- **Evidence**: `http_status` 500-599
- **Severity/confidence**: critical / high
- **Affected asset**: the page
- **Current/desired state**: HTTP status / none
- **Actionability**: developer_required
- **Verification**: 2xx on re-crawl
- **Platform execution**: none

---

## B. Indexability

### `noindex_page`
- **Evidence**: `crawl_pages.noindex = true`
- **Detection**: direct field read (meta robots or X-Robots-Tag, extracted at crawl time)
- **False-positive boundary**: none — an explicit directive is unambiguous
- **Severity/confidence**: high / high
- **Current/desired state**: "noindex present" / none (removal is an intent decision)
- **Actionability**: guided_fix
- **Verification**: `noindex` becomes false on re-crawl
- **Platform execution**: none

### `indexable_page_blocked_by_robots`
- **Evidence**: `robots_allowed=false`, `noindex != true`, successful status
- **Detection**: distinguishes "no noindex signal but robots blocks it anyway" from the conflicting-signal case below
- **False-positive boundary**: excludes pages that also carry noindex (see `conflicting_indexability_signals`)
- **Severity/confidence**: high / medium (inferred from two independent signals, not one)
- **Actionability**: guided_fix
- **Verification**: `robots_allowed` becomes true, or noindex is added deliberately
- **Platform execution**: none

### `conflicting_indexability_signals`
- **Evidence**: `noindex=true` AND `robots_allowed=false`
- **Severity/confidence**: low (usually harmless) / medium
- **Actionability**: guided_fix
- **Verification**: signals become consistent
- **Platform execution**: none

### `important_page_non_indexable`
- **Evidence**: `noindex=true` or `robots_allowed=false`, AND `isImportantPage` (depth 0, or ≥3 distinct inbound internal links — see `evidence.ts`'s documented heuristic)
- **False-positive boundary**: "important" is a coarse, explicitly-heuristic proxy, never presented as certain — hence medium confidence
- **Severity/confidence**: high / medium
- **Current state**: inbound link count, homepage flag
- **Actionability**: guided_fix
- **Verification**: page becomes indexable
- **Platform execution**: none

---

## C. Canonicals

### `missing_canonical`
- **Evidence**: successful HTML page, `canonical_url = null`
- **Severity/confidence**: medium / high
- **Desired state**: the page's own final URL
- **Remediation type**: canonical_change
- **Actionability**: guided_fix
- **Verification**: canonical present on re-crawl
- **Platform execution**: none

### `invalid_canonical`
- **Evidence**: `canonical_url` present but doesn't resolve to a valid http/https absolute URL
- **False-positive boundary**: relative URLs resolve fine via `normalizeUrl`; only genuinely malformed values (e.g. a non-http(s) scheme) trigger this
- **Severity/confidence**: medium / high
- **Desired state**: the page's own final URL
- **Remediation type**: canonical_change
- **Actionability**: guided_fix
- **Platform execution**: none

### `canonical_cross_domain`
- **Evidence**: canonical hostname differs from the page's own hostname
- **False-positive boundary**: deliberately NOT auto-treated as an error (syndicated content is legitimate) — medium confidence, low severity, `monitor` actionability
- **Desired state**: none (intent-dependent, never guessed)
- **Platform execution**: none

### `canonical_http_downgrade`
- **Evidence**: same-host canonical whose protocol is `http:` while the page is `https:`
- **Migrated from**: legacy `canonical_http` (see the classification doc)
- **Severity/confidence**: medium / high
- **Desired state**: the same URL with `https:`
- **Remediation type**: canonical_change
- **Actionability**: guided_fix
- **Platform execution**: none

### `canonical_target_error`
- **Evidence**: canonical resolves to a same-host page **this same crawl also discovered**, whose status is failed or non-2xx
- **False-positive boundary**: a target outside this crawl's own discovered pages is never evaluated or claimed broken (no guessing)
- **Severity/confidence**: high / high
- **Desired state**: the source page's own final URL
- **Remediation type**: canonical_change
- **Actionability**: guided_fix
- **Platform execution**: none

### `canonical_target_non_indexable`
- **Evidence**: canonical target (same-crawl) is noindex or robots-blocked
- **Severity/confidence**: high / high
- **Platform execution**: none

---

## D. Redirects

### `internal_link_to_redirected_url`
- **Evidence**: `crawl_links` edge whose target (same-crawl) has `final_url != url`
- **Detection**: ONE instance per (source page, target URL) edge — never deduplicated to "one row per target" (the exact Phase 26A bug this phase fixes; see Checkpoint 9)
- **Affected asset**: the link target (`affectedResourceUrl`), anchored to its source page (`url`)
- **Current state**: target URL + HTTP status
- **Desired state**: the target's own `final_url`
- **Remediation type**: url_replacement
- **Severity/confidence**: low / high
- **Actionability**: guided_fix
- **Verification**: the link's target no longer redirects, or the link itself points at the final URL
- **Platform execution**: none
- **Distinct counts**: `affected_page_count` (source pages) / `occurrence_count` (edges) / `unique_target_count` (targets) are computed independently — see `docs/technical-seo-legacy-classification.md`'s sibling doc, the code comment in `aggregate.ts`, and Checkpoint 9's real-world example.

### `internal_link_to_broken_url`
- **Evidence**: link edge whose target (same-crawl) failed or returned non-2xx
- **Desired state**: none (no confident replacement for a broken destination)
- **Remediation type**: url_replacement (remove/replace, not a specific target)
- **Severity/confidence**: high / high
- **Actionability**: guided_fix
- **Platform execution**: none

### `https_downgrade_redirect`
- **Evidence**: page `url` is https, `final_url` is http
- **Severity/confidence**: high / high
- **Remediation type**: directive_change
- **Actionability**: developer_required
- **Platform execution**: none

---

## E. Robots.txt

### `robots_unreachable`
- **Evidence**: `crawl_runs.robots_status = 'unreachable'`
- **Scope**: site
- **Severity/confidence**: medium / high
- **Actionability**: developer_required
- **Platform execution**: none

### `robots_blocks_site`
- **Evidence**: `robots_status='ok'` AND ≥90% of ≥2 completed pages are `robots_allowed=false`
- **Detection**: inferred from OBSERVED EFFECT across the crawl, not a second robots.txt text parse — deliberately medium confidence as a result
- **False-positive boundary**: requires both a minimum sample size and a high disallow fraction, so a genuinely-intended partial block never triggers this
- **Severity/confidence**: critical / medium
- **Scope**: site
- **Actionability**: guided_fix
- **Platform execution**: none

---

## F. XML sitemaps

### `sitemap_unavailable`
- **Evidence**: `crawl_runs.sitemap_status = 'unreachable'`
- **Scope**: site; **severity/confidence**: medium / high
- **Actionability**: guided_fix
- **Platform execution**: none

### `sitemap_empty`
- **Evidence**: `sitemap_status = 'empty'` (reachable, zero usable URLs)
- **Scope**: site; **severity/confidence**: medium / high
- **Platform execution**: none

### `sitemap_contains_error_url`
- **Evidence**: `discovered_via='sitemap'` AND failed/non-2xx
- **Severity/confidence**: high / high
- **Remediation type**: sitemap_correction
- **Platform execution**: none

### `sitemap_contains_noindex_url`
- **Evidence**: `discovered_via='sitemap'` AND `noindex=true`
- **Severity/confidence**: medium / high
- **Remediation type**: sitemap_correction
- **Platform execution**: none

### `sitemap_contains_blocked_url`
- **Evidence**: `discovered_via='sitemap'` AND `robots_allowed=false`
- **Severity/confidence**: medium / high
- **Remediation type**: sitemap_correction
- **Platform execution**: none

### `important_page_missing_from_sitemap`
- **Evidence**: `isImportantPage` AND `discovered_via != 'sitemap'`, only evaluated when `sitemap_status='ok'`
- **False-positive boundary**: never evaluated when no working sitemap exists at all (would be noise on top of `sitemap_unavailable`)
- **Severity/confidence**: low / medium
- **Remediation type**: sitemap_correction
- **Platform execution**: none

---

## G. URL / protocol health

### `mixed_protocol_internal_links`
- **Evidence**: site's seed page is https; a `crawl_links` internal target starts with `http:`
- **False-positive boundary**: only evaluated for an HTTPS site at all
- **Severity/confidence**: low / high
- **Remediation type**: url_replacement
- **Platform execution**: none

---

## H. Technical page signals

### `empty_or_tiny_page`
- **Evidence**: successful HTML page, `response_size_bytes <= 500`, no title, no H1
- **False-positive boundary**: requires ALL three conditions together — a small-but-real page (has a title/H1) is never flagged
- **Severity/confidence**: medium / medium (could be a legitimate stub page)
- **Actionability**: monitor
- **Platform execution**: none

---

## Structured data

### `structured_data_invalid`
- **Evidence**: `structured_data_present=true`, `structured_data_valid=false`
- **Detection**: JSON-LD blocks parsed with the built-in `JSON.parse` — **JSON-syntax validity only, never schema.org semantic or Google Rich Results validation** (explicitly not implemented; see docs' own note)
- **False-positive boundary**: a page with no structured data at all is never flagged (absence is not an error)
- **Severity/confidence**: medium / high
- **Remediation type**: schema_correction
- **Actionability**: guided_fix
- **Platform execution**: none

---

## Internationalization / hreflang

### `hreflang_invalid_code`
- **Evidence**: `hreflang_tags[].lang` fails a permissive BCP-47-ish pattern
- **False-positive boundary**: only evaluated for pages that declared at least one hreflang tag — a site with no hreflang usage (the overwhelming majority) is never touched by this category
- **Severity/confidence**: medium / high
- **Desired state**: none (correct locale is a business decision)
- **Actionability**: guided_fix
- **Platform execution**: none

### `hreflang_target_error`
- **Evidence**: hreflang href resolves to a same-crawl page that failed/non-2xx
- **Severity/confidence**: medium / high
- **Platform execution**: none

### `hreflang_missing_reciprocal`
- **Evidence**: page A's hreflang points at same-crawl page B, but B has no hreflang tag back to A
- **False-positive boundary**: only evaluated for evaluable pairs (both pages discovered by this crawl) — never guessed for an external/unreached page
- **Severity/confidence**: low / medium (reciprocal setups are sometimes intentionally asymmetric)
- **Actionability**: monitor
- **Platform execution**: none

---

## I. Site-wide technical consistency

### `widespread_non_indexable_pages`
- **Evidence**: ≥5 completed pages, ≥30% noindex or robots-blocked
- **Scope**: site; **severity/confidence**: high / medium
- **Actionability**: developer_required
- **Platform execution**: none

### `widespread_fetch_failures`
- **Evidence**: ≥5 attempted pages, ≥20% failed outright
- **Scope**: site; **severity/confidence**: critical / medium
- **Actionability**: developer_required
- **Platform execution**: none

---

## Intentionally deferred (Checkpoint 5 coverage audit)

- **Canonical chains beyond one hop / multiple canonical signals per page** — the crawler persists a single `canonical_url` per page; detecting multi-tag or multi-hop chains would require re-parsing raw HTML for every canonical tag present, which the persisted evidence does not carry. Deferred until a real need justifies extending crawl_pages further.
- **Duplicate crawlable URL variants, trailing-slash inconsistency, parameterized-variant analysis** — Phase 25's own URL normalization (tracking-parameter stripping, trailing-slash collapsing) already prevents most of these from ever surfacing as distinct `crawl_pages` rows, so there is little left to detect; the residual cases would require speculative duplicate-content judgment explicitly out of scope for this phase.
- **Sitemap-canonical cross-conflict** (a sitemap URL whose canonical points elsewhere) — a real, defensible check, but combinatorially it means joining sitemap membership against canonical target across all pages; deferred as a Phase 26.x refinement once real usage data shows it matters.
- **JSON-LD schema.org semantic validation / Google Rich Results eligibility** — explicitly out of scope; webioom does not implement or claim to implement Google's own validation.
- **Full BCP-47 hreflang registry validation** — the implemented pattern is a reasonable heuristic, not a real language-subtag-registry lookup.
