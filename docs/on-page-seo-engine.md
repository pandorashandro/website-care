# On-Page SEO Engine (Phase 28)

Answers: *"Is this individual page properly optimized for search and clearly communicating what it is about?"* — the page's OWN title/meta description/heading quality, as distinct from Technical SEO's "can search engines crawl/index correctly" and Site Architecture's "how do pages connect to each other." Follows the exact canonical-category-engine pattern Phase 26/27 established: one persisted analysis, one score, one finding set, consumed identically by Overview's summary tile and this category's own dedicated detail page.

## 1. Engine contract

| Responsibility | Implementation |
|---|---|
| Score | `lib/on-page/health.ts`, persisted on `crawl_analyses.health_score` (analyzer_version = `on-page-v1`) |
| Findings | `on_page_findings` — one row per distinct, aggregated problem (`lib/on-page/aggregate.ts`) |
| Evidence | `on_page_finding_pages` — typed `current_state`/`desired_state` plus a `detail` JSONB escape hatch, reusing `lib/category-engine/types.ts`'s generic `StateValue`/`RawFindingPageEvidence` |
| Solution | `proposed_change` + `remediation_type` (including the new, additively-extended `content_field_replacement`) |
| Actionability | `lib/on-page/actionability.ts` — the same canonical five-value vocabulary every engine uses |
| Verification | Re-analysis of a fresh crawl — a finding disappearing on the next analysis IS the verification |

Orchestration entry point: `lib/on-page/run-analysis.ts`'s `analyzeOnPage(store, crawlRunId)`, invoked from `app/dashboard/websites/[id]/on-page-actions.ts`'s ownership-checked `analyzeOnPageCrawlRun`. Idempotent (re-analysis replaces the prior `(crawl_run_id, analyzer_version)` result wholesale), per-check isolated.

## 2. Repository architecture inspected before implementation

`lib/technical-seo/` and `lib/architecture/` (full pipeline: types/eligibility/context/checks/aggregate/health/actionability/store/supabase-store/run-analysis), `lib/category-engine/` (severity.ts, types.ts), Phase 25's crawl evidence (`crawl_runs`/`crawl_pages`/`crawl_links`, `lib/crawler/engine.ts`, `lib/crawler/page-extract.ts`, `lib/crawler/evidence.ts`), the legacy scanner (`lib/scanner/issue-definitions.ts`, `title-rules.ts`, `meta-description-rules.ts`, `checks.ts`, `calculate-health-score.ts`, `aggregate-issues.ts`), `docs/technical-seo-legacy-classification.md` (the machine-checked ON_PAGE_SEO classification of every legacy check), the full Safe Fix stack (`lib/fixes/fixability.ts`, `fix-preview.ts`, `title-preview.ts`, and every `app/dashboard/websites/[id]/wordpress-*-fix-actions.ts`/`*-rollback-actions.ts` file), and the Overview report (`app/dashboard/websites/[id]/page.tsx`, `components/report/category-score-grid.tsx`, `report-helpers.ts`).

## 3. Existing evidence reused

`crawl_pages.title`, `.meta_description`, `.h1_text`, `.canonical_url`, `.noindex`, `.http_status`, `.content_type`, `.status`, `.final_url` — all already persisted by Phase 25/26B, unchanged. `lib/scanner/title-rules.ts`'s `classifyTitleLength` and `lib/scanner/meta-description-rules.ts`'s `classifyMetaDescriptionLength` are reused VERBATIM (not reimplemented) — both are the existing, already-tested, already-shared-with-the-fix-verifier source of truth for the 30/60 and 70/160 character thresholds.

## 4. Crawler evidence added, and why

**One column: `crawl_pages.h1_count` (integer, default 0).** `h1_text` (existing) only ever stores the FIRST `<h1>`'s text (`h1Texts[0]`), which cannot distinguish "exactly one H1" from "three H1s, first one shown" — needed for `multiple_h1`. Extraction reuses the SAME `getH1Texts()` call `page-extract.ts` already makes for `h1_text` (`.length` on the already-computed array) — no new HTML parsing pass, no new network call. This is the only crawler evidence expansion; every other V1 check is fully answerable from already-persisted fields. Image/alt evidence (see §7) was deliberately NOT added, since that check was excluded from V1 entirely.

## 5. Category boundary

On-Page SEO owns: title presence/length/duplication/genericness, meta description presence/length/duplication, H1 presence/count. It explicitly does NOT own (per `docs/technical-seo-legacy-classification.md`'s locked classification and this phase's own instructions): robots/sitemap/canonicals/redirects/indexability mechanics/hreflang/schema validity (Technical SEO); orphan pages/crawl depth/link graph/dead ends/underlinked pages/redirect edges (Site Architecture); topical completeness/thin content/readability/intent fulfillment (Content — Phase 29); Core Web Vitals/image weight/JS-CSS performance (Performance); WCAG-level alt/ARIA/contrast/keyboard (Accessibility); HTTPS/security headers (Security).

## 6. Eligibility model

`lib/category-engine/eligibility.ts`'s `isEligibleContentPage` (promoted from `lib/architecture/eligibility.ts`'s Phase 27 real-world-evidence-quality-pass rule once a SECOND consumer needed it — see that module's own doc comment for why it was copied fresh rather than wired as a re-export from Architecture's already-accepted code). A page is eligible only if its own evidence affirmatively supports it: fetched successfully as 2xx HTML, not `noindex`, self-canonicalizes (no canonical tag, or one pointing at its own URL). Conservative, keep-by-default — never excludes on URL shape/query-string alone, never infers unavailable facts. Applied uniformly to every On-Page V1 check (unlike Site Architecture, there is no edge-based check for which target eligibility would be irrelevant — every On-Page check is inherently about the SUBJECT page's own title/meta/heading).

**False-positive risk:** a genuinely eligible page temporarily noindexed for an unrelated reason (e.g. a campaign landing page) is excluded from On-Page evaluation too. **False-negative risk:** a utility/template endpoint carrying neither `noindex` nor a cross-canonical is not excluded — accepted per the explicit "prefer keeping over guessing" instruction.

## 7. Complete implemented check list (V1)

| Check key | Category | Severity | Confidence | Actionability |
|---|---|---|---|---|
| `missing_title` | title | high | high | prepared_fix |
| `title_too_short` | title | low | high | prepared_fix |
| `title_too_long` | title | low | high | prepared_fix |
| `weak_title` | title | low | medium | guided_fix |
| `duplicate_title` | title | high | high | guided_fix |
| `missing_meta_description` | meta_description | medium | high | prepared_fix |
| `meta_description_too_short` | meta_description | low | high | prepared_fix |
| `meta_description_too_long` | meta_description | low | high | prepared_fix |
| `duplicate_meta_description` | meta_description | medium | high | guided_fix |
| `missing_h1` | headings | medium | high | prepared_fix |
| `multiple_h1` | headings | medium | high | guided_fix |

11 checks — deliberately not optimized for a large count (mirrors Site Architecture's own "34→8 checks... quality over vanity coverage" precedent).

## 8. Checks considered but deferred, and why

- **Image alt coverage:** already classified `ACCESSIBILITY` (not `ON_PAGE_SEO`) in the LOCKED `docs/technical-seo-legacy-classification.md` — implementing an On-Page-SEO-flavored alt check would duplicate the same issue across two categories merely to raise finding count, which this phase's own instructions explicitly forbid. No crawler evidence was added for image/alt data as a result.
- **Heading hierarchy (H2-H6 nesting):** would require a genuinely new, larger crawler evidence expansion (persisting each heading's level/text/order, not a simple count) — beyond the "small, careful expansion" this phase permits; a real "crawler rewrite" by this phase's own definition.
- **Title/H1 alignment, URL/title/H1 alignment:** investigated and explicitly rejected. No deterministic, low-false-positive signal exists without semantic/keyword understanding — e.g. a title "Contact Our Team" and H1 "Get in Touch" share zero words and are both fine; a URL slug is legitimately often abbreviated relative to a full-sentence title. Forcing a check here would mean inventing "keyword intent" this phase's own instructions explicitly forbid.
- **Open Graph title/description:** classified `ON_PAGE_SEO` in the legacy classification, but NOT in this task's own explicit V1 check-set request, and not currently persisted by the crawler at all (would need its own new evidence field). Deferred as a legitimate, small future addition rather than in-scope now.

## 9. Thresholds and justification

Title: 30-60 characters (`lib/scanner/title-rules.ts`, pre-existing, shared with the fix verifier — NOT reinvented here). Meta description: 70-160 characters (`lib/scanner/meta-description-rules.ts`, same reasoning). `weak_title`: an exact-match (trimmed, case-insensitive) closed list of 15 known generic/placeholder values (`lib/on-page/checks/title.ts`'s `GENERIC_TITLE_VALUES`) — deliberately NOT a fuzzy content-quality heuristic. All are centralized in one module each, documented, and covered by boundary tests. Length findings (`*_too_short`/`*_too_long`) are LOW severity; absence (`missing_*`) and duplication are HIGH/MEDIUM — length is a search-engine-display heuristic, absence/duplication are more consequential, exactly as this phase's own instructions require.

## 10. Finding/evidence model

Identical shape to Technical SEO/Site Architecture's `RawFinding`/`AggregatedFinding` (checkKey/category/scope/severity/confidence/title/explanation/whyItMatters/recommendation/evidence/affectedPages, plus affectedPageCount/occurrenceCount/uniqueTargetCount/actionability). Every finding names the exact affected URL(s), the exact observed current value (`currentState`), and — where deterministically knowable — a `desiredState` and one-line `proposedChange`. No finding is ever a vague "SEO could be improved" — see any check file's own emitted finding shape for the concrete Page/Current/Why/Recommendation structure this task's own example calls for.

## 11. Actionability mapping (traced against ACTUAL wired backend capability)

Verified by reading `lib/fixes/title-preview.ts` (closed `TitleIssueKind = 'missing'|'too_short'|'too_long'`), `lib/fixes/fix-preview.ts` (closed `H1IssueKind = 'missing_h1'|'multiple_h1'`, and the `MetaDescriptionIssueKind` wiring), and the actual wired server actions (`wordpress-fix-actions.ts`, `wordpress-meta-fix-actions.ts`, `wordpress-h1-fix-actions.ts`, each with a matching `*-rollback-actions.ts`) — not assumed from the legacy `fixability.ts`'s classification alone, which does not distinguish "diagnostic preview only" from "real Apply path" the same way. Full per-check reasoning is in `lib/on-page/actionability.ts`'s own doc comment (§7's table above summarizes the result). No check is ever `safe_fix` (nothing executes without explicit approval) — this is the FIRST canonical engine to legitimately use `prepared_fix` at all, because title/meta-description/missing-H1 are the first canonical findings backed by a real, wired Preview → Apply → Verify → Rollback path.

## 12. Existing Safe Fix compatibility

`missing_title`/`title_too_short`/`title_too_long` map onto `lib/fixes/title-preview.ts`'s three `TitleIssueKind` values exactly. `missing_meta_description`/`meta_description_too_short`/`meta_description_too_long` map onto the equivalent `MetaDescriptionIssueKind`. `missing_h1` maps onto `H1IssueKind.missing_h1`. `duplicate_title`, `duplicate_meta_description`, `weak_title`, and `multiple_h1` are OUTSIDE these closed unions — connecting them would require extending `lib/fixes/`'s own execution engine, which this phase must not do (Phase 30 owns that). No fix executes automatically; Preview → explicit approval → Apply → Verify → History → Undo is fully preserved and untouched.

## 13. Scoring formula

Built on NEW shared primitives, `lib/category-engine/health.ts` — extracted once a THIRD category engine needed the byte-for-byte-identical `SEVERITY_DEDUCTION`/`CONFIDENCE_MULTIPLIER`/`SEVERITY_TIER_CAP` constants and page-fraction spread bucketing that Technical SEO's and Site Architecture's own `health.ts` files had each already independently implemented (exactly the extraction `lib/architecture/aggregate.ts`'s own doc comment anticipated). Deliberately NOT wired back into Technical SEO's or Site Architecture's own `health.ts` — both are already-accepted, fully-tested engines, and this phase's instructions explicitly forbid changing their scoring; those two remain independent, documented tech debt.

```
spread     = fractionSpread(affectedPageCount, totalAnalyzedPages)   // <20% -> 1x, 20-49% -> 1.25x, >=50% -> 1.5x
deduction  = SEVERITY_DEDUCTION[severity] × CONFIDENCE_MULTIPLIER[confidence] × spread
```
Summed per severity tier, each tier capped (critical 100/high 60/medium 30/low 15) before subtracting from 100, clamped 0-100.

No occurrence-aware `max()` the way Site Architecture's health.ts needs (that correction exists specifically for EDGE-based checks where one page can have many distinct target edges) — every On-Page check has exactly one evidence instance per affected page by construction, so `occurrenceCount === affectedPageCount` always holds today; `fractionSpread` uses `affectedPageCount` directly. `occurrenceCount`/`uniqueTargetCount` are still carried on the schema for forward-compatibility and explainability.

## 14. How prevalence is calculated

`fractionSpread(affectedPageCount, totalAnalyzedPages)` — the SAME bucketed, capped multiplier used by every other engine. A single missing meta description on 100 pages (1% → 1x) scores nothing like missing metadata on 90/100 pages (90% → 1.5x, the ceiling) — proportional, never raw-summed, never able to let one widespread low-severity issue swing the whole score by more than its severity tier's own cap allows.

## 15. How duplicates are handled

`duplicate_title`/`duplicate_meta_description` group ELIGIBLE pages by a normalized (trimmed, whitespace-collapsed, case-insensitive) comparison of the field; only pages with a non-empty value participate (multiple missing values are never grouped as "duplicates of nothing" — that's `missing_title`'s/`missing_meta_description`'s own job). Exactly ONE evidence instance is emitted per AFFECTED PAGE — never one per pair — so a 20-page duplicate group contributes `affectedPageCount = 20`, never `C(20,2) = 190` pairwise penalties (verified: `tests/on-page-duplicate-title.test.ts`'s own "duplicate-resistant" test, and `tests/on-page-score-calibration.test.ts`'s "does not create combinatorial score collapse" mutation test). Each instance's `affectedResourceUrl` is set to the shared normalized value itself, reusing the existing three-way `affectedPageCount`/`occurrenceCount`/`uniqueTargetCount` counting mechanism (established Phase 26B/27) so `uniqueTargetCount` becomes the distinct duplicate-GROUP count for free. Group count is surfaced for EXPLAINABILITY only (`explainOnPageHealth`), never fed into the deduction — see `lib/on-page/health.ts`'s own doc comment for why (group count reflects fix effort, not today's search-presentation degradation).

## 16. How site size is normalized

Identical mechanism to duplicate handling and every other finding: `fractionSpread` measures affected pages as a FRACTION of `totalAnalyzedPages`, never an absolute count — the same 3-missing-title-page count means 30% on a 10-page site (1.5x spread) but 1% on a 300-page site (1x spread), verified directly in `tests/on-page-score-calibration.test.ts`'s site-size-normalization suite.

## 17. Confidence behavior

High confidence for every length/presence/duplication/count check (all directly-observed, deterministic facts). Medium confidence only for `weak_title` (an exact-match against a placeholder list is strong but not certain evidence of an unintentional choice). The shared `lib/category-engine/severity.ts` rule applies unchanged: low-confidence findings are capped at medium severity (not triggered by any current On-Page check, since none run below medium confidence); high-severity findings widen to critical only when affecting ≥50% of analyzed pages (verified: `tests/on-page-aggregate.test.ts`'s escalation test).

## 18. Partial-crawl behavior

**No On-Page V1 check is suppressed on a partial crawl.** Unlike Site Architecture's orphan/underlinked checks (which need the WHOLE reachable link graph to avoid false positives), every On-Page finding is either PAGE-LOCAL (a page's own title/meta/H1 is fully known once that page itself was fetched — missing/length/weak/heading checks) or an OBSERVED-DUPLICATE fact that remains true regardless of how many other pages remain unanalyzed (duplicate checks — they just cannot claim completeness, i.e. "these are the only duplicates on the entire site"). Every finding's wording is scoped to "the pages webioom analyzed," never "your site," for exactly this reason. `crawl_runs.status === 'partial'` still flows through to `CategorySummary.partial` and the dedicated page's own explicit notice, identically to every other engine.

## 19. Controlled calibration fixture results

Built in `tests/helpers/on-page-synthetic-site.ts` (disjoint-offset mutators, learning directly from Phase 27's own documented fixture-overlap bug) and exercised end-to-end through the real `analyzeOnPage` pipeline in `tests/on-page-score-calibration.test.ts`:

- **Excellent** (all pages healthy/unique): **100**.
- **Good** (2/40 titles slightly short): **≥90**.
- **Moderate** (8/40 missing meta, 4/40 titles too long): scores meaningfully below Good.
- **Poor** (10/40 missing titles, 8/40 duplicate titles, 10/40 missing meta, 8/40 missing H1): scores meaningfully below Moderate, meaningfully above Severely Broken.
- **Severely Broken** (30/40 missing titles + 10/40 duplicated, all 40 missing meta, all 40 missing H1): **<40**.

Strict descending order (Excellent > Good > Moderate > Poor > Severely Broken) is asserted directly, not just implied by separately-checked bounds.

## 20. Monotonicity results

All hold, verified directly: adding a real problem never improves the score; fixing a problem never reduces it; increasing affected-page prevalence of the same problem never improves the score; a 20-page duplicate-title group never collapses the score via combinatorial (pairwise) counting; re-running analysis on identical evidence reproduces the identical score; scaling up the healthy population while holding the absolute affected-page count fixed never worsens the score.

## 21. Analyzer version

`on-page-v1` (`lib/on-page/types.ts`). Starts at v1, not an arbitrarily higher number — this is the first-ever canonical On-Page SEO analyzer; the legacy scanner's generic `type: 'seo'` bucket is a separate, unversioned system this engine supersedes for its ON_PAGE_SEO-classified subset, not a predecessor version to increment from (mirrors Technical SEO's and Site Architecture's own "start at v1" precedent).

## 22. Persistence architecture

`on_page_findings`/`on_page_finding_pages` (new tables, mirroring `architecture_findings`/`architecture_finding_pages`'s proven shape and RLS pattern exactly), reusing `crawl_analyses` AS-IS (no schema change there — already generic, keyed by `(crawl_run_id, analyzer_version)`). One additive `crawl_pages.h1_count` column. See §23 for the migration.

## 23. Migration

**`supabase/migrations/20261014000000_on_page_findings.sql`** — NOT applied. Purpose: (1) `alter table crawl_pages add column h1_count integer not null default 0` with a `comment on column`; (2) create `on_page_findings` (category constraint: title/meta_description/headings; RLS: `authenticated` SELECT only, service-role writes only, mirroring every prior findings table); (3) create `on_page_finding_pages` (adds `content_field_replacement` to the shared `remediation_type` CHECK constraint list, alongside every existing value). Rollback is a clean drop of both tables plus the one column — documented in the migration's own footer.

## 24. Overview integration

`app/dashboard/websites/[id]/on-page-summary.ts`'s `getOnPageCategorySummary`/`buildOnPageCategorySummary` mirror `site-architecture-summary.ts` exactly — reads the SAME `crawl_analyses` row (by `crawl_run_id` + `analyzer_version = 'on-page-v1'`) the dedicated page reads, verbatim, with no independent scoring on the Overview page. `components/report/category-score-grid.tsx` now renders an On-Page SEO tile via the shared `CategoryEngineTile` component (same one Technical SEO and Site Architecture use) and — critically — **excludes the legacy generic `seo` category from the grid's remaining placeholder cards** (`OTHER_CATEGORY_ORDER` now filters out both `'technical'` and `'seo'`), so the legacy "SEO" score is never shown alongside canonical On-Page SEO as a second, competing category. Before analysis, the tile shows "Not analyzed yet" (identical shared component logic to every other engine).

## 25. Dedicated On-Page SEO page implementation

`app/dashboard/websites/[id]/on-page-seo/page.tsx` (+ `on-page-seo-controls.tsx`, `loading.tsx`), added to `WebsiteSubNav`. Same solution-first hierarchy as the Site Architecture page: score + severity badges + summary metrics (pages analyzed, missing titles, duplicate titles, missing meta descriptions, missing/multiple H1 counts) → sorted findings (most severe first) → per-finding evidence (up to 8 affected pages shown, "+N more" beyond that) → why-it-matters/recommendation → actionability badge. Partial-crawl notice explicitly states findings describe only the analyzed pages.

## 26. Legacy SEO transition behavior

The legacy scanner (`lib/scanner/`) and its `type: 'seo'` issue bucket are UNCHANGED and NOT deleted — they still power the main issue list body further down the Overview report (title/meta/H1 findings continue to appear there too, alongside genuinely-Technical-SEO-classified legacy checks not yet migrated, e.g. `missing_canonical`/OG tags). Only the Category Health GRID CARD is replaced (§24) — this is a deliberate, minimal, additive transition matching this phase's explicit "do not redesign Overview" and "handle transitional state carefully" instructions. A full retirement of the legacy scanner's on-page-related issue rows from the report body is future work, not required by this phase (which only mandates the ONE category card be canonical, never that both scoring systems disappear from the page).

## 27. Known limitations

Heading hierarchy (H2-H6) is not analyzed. Title/H1/URL alignment is not analyzed (no reliable deterministic signal exists). Image alt coverage is intentionally out of scope (owned by Accessibility). `weak_title`'s placeholder list is a small, closed set — a genuinely weak but non-placeholder title (e.g. "Stuff") is not detected. Duplicate detection cannot claim site-wide completeness on a partial crawl. Actionability for `duplicate_title`/`duplicate_meta_description`/`weak_title`/`multiple_h1` is `guided_fix` even though the underlying single-page write mechanism could technically be invoked for them — deliberately conservative, since doing so would require extending `lib/fixes/`'s own closed issue-kind unions (Phase 30's job, not this phase's).

## 28. Deferred to Phase 29 (Content) / Phase 30 (Safe Fix 2.0) / later

**Phase 29 Content Intelligence:** topical completeness, thin-content-as-a-quality-judgment, missing sections, FAQ opportunities, readability, intent fulfillment, keyword/search-data-informed title-H1-content alignment, substantive rewriting suggestions.
**Phase 30 Safe Fix 2.0:** extending `lib/fixes/`'s title/meta-description/H1 issue-kind unions to cover `duplicate_title`/`duplicate_meta_description`/`weak_title`/`multiple_h1`; any AI-generated proposed replacement values beyond the existing deterministic slug-based title proposal.
**Unscheduled:** heading hierarchy analysis (needs a genuinely new crawler evidence expansion), Open Graph title/description checks (needs new crawler evidence, not requested in this phase's explicit V1 list).

## 29. Real-world evidence validation (first Bespoke analysis, 57/100)

Triggered by Bespoke's first post-migration analysis: 30 pages, 1 High/2 Medium/1 Low finding, duplicate_title 12/30, missing_meta_description 30/30, missing_h1 30/30. Full audit traced every layer end to end; conclusion below.

**Eligibility (Observation 1):** the duplicate_title finding legitimately included page-builder template/utility URLs (a mega-menu template query string, two theme-builder header/footer entries) alongside genuine content pages. Traced: these pass eligibility because they were fetched successfully as 2xx HTML, are not marked `noindex`, and do not declare a cross-canonical — exactly the three signals `isEligibleContentPage` checks, and no OTHER general, reliable persisted signal exists to distinguish them (`discovered_via`, `robots_allowed`, and `structured_data_present` were all considered and rejected — none reliably separates a template resource from a legitimate content page without unacceptable false-negative risk on real pages). **Conclusion: current eligibility is defensible; no correction made.** This is the conservative, evidence-driven behavior this engine was designed to have — a CMS/URL-pattern hack was considered and explicitly rejected. `tests/on-page-eligibility.test.ts` now locks this in with both a positive regression test (these URL shapes stay eligible absent an affirmative disqualifying signal) and a static-analysis test asserting the eligibility source code itself contains no CMS/platform-specific string.

**h1_count extraction/persistence (Observation 2):** traced exhaustively — `getH1Texts()` → `h1Count: h1Texts.length` (`page-extract.ts`) → `metadata.h1Count` → `store.updatePage(id, { ..., h1_count: metadata.h1Count })` (`engine.ts`) → `admin.from('crawl_pages').update(patch)` (a generic, unfiltered passthrough — `supabase-store.ts`) → read back verbatim by `OnPageStore.getCrawlEvidence` → `lib/on-page/checks/headings.ts` reads `page.h1_count`/`page.h1_text` directly. Every completed page's `h1_count` is EXPLICITLY overwritten on the same `updatePage` call that marks it `completed` — the column's `DEFAULT 0` only ever applies to not-yet-fetched `queued` rows, never silently masking a real extraction result. **Conclusion: the pipeline is correct; 30/30 missing H1 is genuine engine behavior, not a persistence bug.** Whether Bespoke's actual live pages genuinely lack an `<h1>` (a common, real WordPress/theme pattern: the site name occupies the header's own H1, and page content starts at H2) cannot be confirmed further without live access to this environment — see §11 below.

**Meta description extraction/persistence (Observation 3):** traced identically — `getMetaDescriptionContent()` → `metadata.metaDescription` → `store.updatePage(..., { meta_description: metadata.metaDescription })` → same generic passthrough → read directly by `lib/on-page/checks/meta-description.ts`. Verified against realistic markup variations (reversed attribute order, single/double quotes, self-closing tags, multi-line attributes) — all extract correctly; no selector bug found. **Conclusion: 30/30 missing meta descriptions is genuine.**

**Source HTML vs. rendered DOM:** confirmed definitively — `lib/scanner/checks.ts`'s `fetchPage` uses Node's native `fetch()` with manual redirect-following and raw-text decoding; no headless browser, no JS execution anywhere in the codebase (`package.json` has no puppeteer/playwright/jsdom dependency). **webioom analyzes raw, server-returned HTTP HTML only, never a rendered/hydrated DOM.** This is a real, standing limitation for any site whose title/meta description/H1 is injected client-side via JavaScript after initial load (documented here, not fixed — out of this validation's scope, and out of Phase 28's scope generally).

**Score reconstruction:** verified deterministic and exactly reproducible — `tests/on-page-health.test.ts`'s new "Bespoke real-world evidence validation" suite reconstructs 57 from `duplicate_title` (12/30 → 1.25x spread → 18.75), `missing_meta_description` (30/30 → 1.5x → 10.5), `missing_h1` (30/30 → 1.5x → 10.5), and one small Low finding (<20% → 1x → 3): total deduction 42.75, `100 - 42.75 = 57.25`, rounds to **57**. No severity tier cap engages (high 18.75 ≪ 60; medium 21 ≪ 30; low 3 ≪ 15) — a plain sum, rounded once at the end. **No scoring defect found; no change made.** (The real-world report's own summary tile does not surface every possible check type, so the exact identity of the 4th, Low-severity finding cannot be pinned down from the given information alone — any small-scope Low finding reproduces the same total.)

**Actionability truthfulness:** verified `prepared_fix` (missing_title/title length/meta description length/missing_h1) against the actually-wired WordPress Preview→Apply→Verify→Rollback server actions — the classification is correct in what it claims ("a real backend exists for this kind of change"). However, the dedicated page previously showed "SOLUTION READY FOR APPROVAL" unconditionally, regardless of whether THIS website actually has a working WordPress connection. **Correction made:** `app/dashboard/websites/[id]/on-page-seo/page.tsx` now reuses the existing `getWordPressConnectionSummary`/`toIntegrationFixabilityInputs` helpers (already used identically by the Overview report) to add an honest qualifier caption ("Requires a connected WordPress site with content-editing permission.") under a `prepared_fix` badge whenever no working connection exists — `finding.actionability` itself, the actionability classification, and scoring are all unchanged.
