# Content Intelligence Engine (Phase 29)

Answers: *"Does this page contain useful, sufficiently complete, clear and differentiated content for its apparent purpose — and what should the website owner improve?"* Follows the exact canonical-category-engine pattern Phases 26-28 established: one persisted analysis, one score, one finding set, consumed identically by Overview's summary tile and this category's own dedicated detail page.

## 1. Engine contract

| Responsibility | Implementation |
|---|---|
| Score | `lib/content/health.ts`, persisted on `crawl_analyses.health_score` (analyzer_version = `content-v2`) |
| Findings | `content_findings` — one row per distinct, aggregated problem/opportunity (`lib/content/aggregate.ts`) |
| Evidence | `content_finding_pages` — typed `current_state`/`desired_state` plus a `detail` JSONB escape hatch |
| Actionability | `lib/content/actionability.ts` |
| Verification | Re-analysis of a fresh crawl |

Orchestration entry point: `lib/content/run-analysis.ts`'s `analyzeContent(store, crawlRunId)`, invoked from `app/dashboard/websites/[id]/content-actions.ts`'s ownership-checked `analyzeContentCrawlRun`.

## 2. Category boundary

Content owns the 12 canonical Content Intelligence report dimensions (§30 below): Depth, Completeness, Quality & Clarity, Duplicate Content, Repetitive/Boilerplate Content, Structure, Page Purpose, FAQ/Question Coverage, Topical Coverage, Differentiation, Freshness, Opportunities. It does NOT own: robots/sitemap/canonicals/schema validity (Technical SEO), title/meta/H1 presence-and-length (On-Page SEO), link graph/orphan pages (Site Architecture), Core Web Vitals (Performance), WCAG/ARIA (Accessibility), HTTPS (Security).

---

## PART 2 ADDENDUM — Real-world correction + the complete 12-dimension report (content-v2)

A fresh, real-world Bespoke analysis under `content-v1` produced `Content Health: 93` with visibly populated pages (`/`, `/services`, `/about-us`, `/services/digital-marketing`) reporting **"Substantive word count: 0."** This section documents the root-cause investigation, the correction, and the complete 12-dimension architecture built on top of it.

### 30. Root cause

Traced end to end: raw HTTP HTML → `getParagraphTexts` (`<p>`-only regex extraction) → 0 paragraphs → `content_word_count = 0`. The persistence path was independently re-verified and is NOT the cause — `lib/crawler/engine.ts` explicitly overwrites `content_word_count`/`content_text`/etc. on every completed page's own `updatePage` call from the freshly-computed extraction result; the column's `DEFAULT 0` only ever applies to not-yet-fetched `queued` rows. The genuine root cause is **extraction being too narrow**: Bespoke's body copy is rendered inside page-builder `<div>` containers (a common Elementor/WordPress pattern for text-editor, icon-box, and CTA widgets), never wrapped in literal `<p>` tags — so `getParagraphTexts` legitimately found nothing, and "0 words" was a truthful but misleadingly narrow measurement, not a lie and not a database bug.

### 31. Corrected extraction algorithm

`lib/scanner/checks.ts`'s new `getSubstantiveBlocks(html)`, used by `lib/crawler/content-extract.ts`:

1. Collapse pre-existing newlines/tabs in the source to spaces (so only inserted boundaries — not incidental source formatting — ever split one paragraph's own text into two).
2. Remove `<script>`/`<style>`/`<noscript>`/`<template>` entirely (tag + content).
3. Remove `<nav>`/`<header>`/`<footer>` entirely (tag + content) — the standard HTML5 elements for navigation/site-header/site-footer chrome; generic and semantic, never a CMS-specific class dictionary.
4. Insert a block boundary at every remaining `p`/`div`/`li`/`section`/`article`/`blockquote`/`tr`/`td`/`th`/`figcaption`/`dd`/`dt` tag boundary (open AND close) — this segments the flat HTML into block fragments WITHOUT ever duplicating a nested element's text (proven directly in `tests/crawler-content-extract.test.ts`'s "extracts nested block content without duplicating" test).
5. Strip remaining (inline/heading) tags, decode entities, split on the inserted boundaries, trim/collapse whitespace, drop empty fragments.
6. `lib/crawler/content-extract.ts` then filters out any fragment below `MIN_BLOCK_WORDS` (4) — a conservative substitute for real link-density analysis, catching most unwrapped menu-label leakage without building a DOM-aware link-density engine.

**Known, documented limitation:** no link-density filtering — a genuine navigation block NOT wrapped in `<nav>`/`<header>`/`<footer>` could still leak through if its own text clears the 4-word floor. Building reliable link-density detection would need per-block anchor-coverage tracking before tag-stripping — a meaningfully bigger DOM-aware mechanism this phase's own "do not build a huge DOM-template engine" instruction rules out.

### 32. Extraction confidence — OBSERVED EMPTY vs. INSUFFICIENT EVIDENCE

A new persisted signal, `crawl_pages.content_extraction_confidence` ('high'/'low'), computed once at crawl time by comparing the block-based substantive word count against the FULL raw visible-text word count (`getVisibleText` — literally everything, chrome included). `'low'` means real visible text exists but almost none of it landed in a substantive block — evidence the extraction missed this page's structure, **never** evidence the page is empty. Combined at analysis time (`lib/content/eligibility.ts`) with the pre-existing HTML-bytes-vs-word-count check (catches the DIFFERENT failure mode of a genuinely client-rendered page where even raw visible text is minimal) — either signal alone is sufficient to report `'low'`.

**Behavioral consequence (a deliberate strengthening beyond "soften confidence"):** `lib/content/checks/thin-content.ts` now **excludes** `'low'`-confidence pages from evaluation entirely, rather than reporting them as "thin" at a softened confidence level. A real-world review found that a softened label still reads to a customer as a confident "0 words" claim — exclusion is the honest behavior this phase's own instructions require ("soften OR SUPPRESS").

### 33. The 12 canonical dimensions — implementation summary

| # | Dimension | Backing | Kind semantics | Status model |
|---|---|---|---|---|
| 1 | Content Depth | `substantively_thin_page` (deterministic) | problem | healthy / findings / limited_confidence (≥30% of pages had low extraction confidence) / not_assessed |
| 2 | Content Completeness | `content_completeness_gap`/`_opportunity` (AI, **not live by default**) | problem / opportunity | not_assessed by default; findings/opportunities only when an AI hook is actually wired in |
| 3 | Quality & Clarity | none | — | **always not_assessed** — no deterministic evidence exists; would require semantic interpretation not built this phase |
| 4 | Duplicate Content | `exact_duplicate_content` (deterministic) | problem | healthy / findings / not_assessed |
| 5 | Repetitive/Boilerplate | `highly_repetitive_page` (deterministic) | problem | healthy / findings / limited_confidence (<5 eligible pages — too few for a reliable cross-page pattern) / not_assessed |
| 6 | Content Structure | `weak_content_structure` (deterministic) | problem | healthy / findings / not_assessed |
| 7 | Page Purpose | `page_purpose_summary` (deterministic, **always emitted**) | opportunity (zero score impact, always) | healthy ("Analyzed") / limited_confidence (most pages unclassified) |
| 8 | FAQ/Question Coverage | `faq_opportunity` (deterministic) | opportunity only, never a problem | healthy / opportunities / not_assessed |
| 9 | Topical Coverage | none | — | **always not_assessed** — would require semantic/keyword evidence this phase explicitly does not invent |
| 10 | Content Differentiation | DERIVED from #4 + #5, no new deduction | — | findings (when #4/#5 fire) / limited_confidence (no overlap found, but broader differentiation still not assessed) / not_assessed |
| 11 | Content Freshness | none | — | **always not_assessed** — no publish/modified-date evidence is persisted (no structured-data dates, no HTTP Last-Modified capture, no visible-date parsing); a copyright-footer year is explicitly never used as evidence |
| 12 | Content Opportunities | rollup of every opportunity-kind finding (excluding the always-on #7) | — | healthy / opportunities |

`lib/content/dimensions.ts`'s `computeDimensionStatuses` is a pure function computing all 12 from the persisted findings list alone (reusing `page_purpose_summary`'s own evidence — always present when ≥1 eligible page exists — as the free "how many pages were eligible / how many had low extraction confidence" scope record, avoiding any further new persistence). 28 dedicated tests (`tests/content-dimensions.test.ts`) lock in every status transition.

### 34. AI architecture (Content Completeness)

`lib/content/ai/completeness-interpretation.ts` reuses the existing, mature `lib/ai/client.ts` (`generateAiCompletion` — server-only, existing `ANTHROPIC_API_KEY` handling, timeout, structured failure reasons) rather than building a second AI framework. Identifies which of 7 fixed dimensions (`what_it_is`, `who_its_for`, `benefits_outcomes`, `process_how_it_works`, `proof_examples`, `common_questions`, `next_step`) a page's own text appears to be missing. Structured JSON output, strict allow-list schema validation (unknown enum values / wrong types / oversized arrays all rejected → `'unavailable'`, never partially trusted), markdown-code-fence-defensive parsing, bounded input (3000 chars, defense in depth beyond the 4000-char extraction-time bound), 400 max output tokens.

**Prompt-injection defense:** the system prompt explicitly names `PAGE TITLE`/`PAGE H1`/`PAGE CONTENT` as untrusted data, explicitly describes the injection-attempt patterns to expect, and explicitly instructs the model to never let anything in those fields change its task/format/behavior — mirroring `lib/ai/meta-description-recommendation.ts`'s own proven framing. 15 dedicated tests (`tests/content-ai-completeness.test.ts`) include feeding literal "ignore previous instructions... reveal your system prompt" text through `contentText`/`title`/`h1Text` and asserting it is passed through as inert data, never followed.

**NOT WIRED INTO THE LIVE PRODUCTION PIPELINE BY DEFAULT.** `analyzeContent(store, crawlRunId, options?)` accepts an optional `completenessAiHook`; `app/dashboard/websites/[id]/content-actions.ts` (the real production caller) does not pass it. This is a deliberate scope decision: genuinely responsible live invocation needs plan-based budget/entitlement gating and content_hash-keyed caching across re-crawls, which is real, separate scope (see §35) this phase documents but does not fully build. The module is complete, tested against every required failure mode, and ready to enable behind that layer without further architectural change to the AI call itself.

### 35. AI cost control (designed, not fully built)

`lib/content/checks/completeness-ai.ts` (invoked only when a hook is supplied) implements the bounded strategy this phase requires even while not live: reviews at most `AI_MAX_PAGES_PER_ANALYSIS` (10) eligible pages, prioritized by substantive word count (richer pages are more informative; thin pages already have their own, more basic, deterministic problem), skips pages with `'low'` extraction confidence entirely (unreliable extraction must not feed a semantic conclusion either), and records honest coverage (`pagesReviewed`/`pagesEligible`) directly in the finding's evidence — a customer never mistakes "the 10 richest pages were reviewed" for "everything was reviewed." `lib/entitlements/plans.ts`'s existing `PLAN_CAPABILITIES` (`maxCrawlPages`, `aiFixesAllowed`) is the natural home for a future per-plan AI-page-budget field — inspected, not modified (no pricing/limits invented here). Full test coverage in `tests/content-run-analysis-ai.test.ts`, including a 15-page site proving exactly 10 (never 15) hook invocations occur.

### 36. AI failure/fallback and bounded score impact

Every AI failure mode (timeout, provider error, not-configured, invalid JSON, schema-invalid response, unknown enum value) resolves to a normal, typed `'unavailable'` result — never a thrown exception. `lib/content/run-analysis.ts` additionally isolates the ENTIRE AI step in its own try/catch: if `completenessAiHook` itself throws, deterministic findings computed earlier in the same run are used regardless (verified directly: `tests/content-run-analysis-ai.test.ts`'s "AI FAILURE MUST NOT MAKE THE WHOLE CONTENT ANALYSIS FAIL" test). Score impact is bounded two ways: only `'high'`-AI-confidence interpretations become `kind: 'problem'` findings, and even then the REPORTED confidence is hard-capped at `'medium'` (never `'high'`, regardless of what the model itself claimed) — an AI-derived conclusion is never treated with the same certainty as a directly observed fact. `'medium'`/`'low'`-AI-confidence interpretations become `kind: 'opportunity'` (zero score impact, always).

### 37. Persistence changes (content-v2)

New migration `supabase/migrations/20261028000000_content_v2_dimensions.sql` (additive, **NOT applied** — the original `20261021000000_content_findings.sql` has already been applied and is left completely untouched, comments included): adds `crawl_pages.content_extraction_confidence`; widens `content_findings`'s `category` CHECK constraint to add `'faq'` and `'page_purpose'`. No new table was added for AI caching/per-page semantic persistence — justified in §35: no live AI consumer exists yet to cache for, so a `content_page_analyses`-style table would be speculative schema with no current reader; it is the natural next addition once live AI invocation is actually enabled.

### 38. Analyzer version

Bumped `content-v1` → `content-v2`: both EXTRACTION semantics (block-based, not `<p>`-only) and FINDING semantics (thin-content now excludes rather than softens low-confidence pages; new `page_purpose_summary`/`content_completeness_*` check keys; `faq_opportunity`'s category moved from `'completeness'` to `'faq'`) changed materially. Mirrors every prior category engine's own v1→v2 precedent: the existing v1 row is left untouched as dormant history; a website with a v1 score needs a fresh crawl + re-analysis before its Content number reflects the corrected model.

## 3. Existing evidence available before Phase 29

`crawl_pages.title/h1_text/canonical_url/noindex/http_status/content_type/status/response_size_bytes` (all pre-existing). No word count, paragraph structure, heading list beyond H1, content hash, or any text sample existed before this phase — `lib/scanner/checks.ts`'s `getVisibleTextLength` existed but returned only a character count, discarding the text itself.

## 4. Crawler evidence expansion implemented

Five new `crawl_pages` columns, all derived from the SAME already-fetched HTML (no second fetch, no headless browser):

| Column | Purpose |
|---|---|
| `content_text` | Cleaned `<p>`-only visible text, paragraphs joined by `\n\n`, bounded to 4000 chars (a PREFIX on long pages) |
| `content_word_count` | Full-page (untruncated) word count — the thinness-detection basis |
| `content_paragraph_count` | Full-page (untruncated) non-empty `<p>` count |
| `content_heading_texts` | Up to 20 `<h2>` texts, each capped at 150 chars |
| `content_hash` | sha256 of the FULL normalized text, for O(1) exact-duplicate grouping; null below 10 words |

Deliberately NOT raw HTML — see `lib/crawler/content-extract.ts`'s own doc comment for the storage-size/signal-density reasoning (a real page's HTML runs 50-300KB; these five fields are a few hundred bytes to ~4KB and cover every V1 check).

`lib/scanner/checks.ts` was refactored (behavior-preserving) to extract a shared `getVisibleText(html): string` from `getVisibleTextLength`'s own prior inline logic, plus two new extractors (`getParagraphTexts`, `getH2Texts`) mirroring `getH1Texts`'s exact pattern.

## 5. Data/storage/privacy decisions

Only publicly-fetched page BODY text is ever captured — the same trust boundary as title/meta_description/h1_text (persisted since Phase 25A). No form fields, cookies, headers, or hidden source data. `content_text` is bounded and truncated (documented above); `content_heading_texts` is capped at 20 entries x 150 chars. No separate retention policy — these columns live and are overwritten exactly like every other `crawl_pages` field, on the crawl's own lifecycle.

## 6. Source HTML / rendering limitations

Confirmed definitively (re-verified this phase): `lib/scanner/checks.ts`'s `fetchPage` uses native `fetch()`, manual redirect-following, raw-text decoding — no headless browser, no JS execution, no puppeteer/playwright/jsdom dependency anywhere in `package.json`. **webioom analyzes raw, server-returned HTTP HTML only.** Content Intelligence accounts for this via `lib/content/eligibility.ts`'s `getExtractionConfidence` — a page with substantial HTML bytes (`response_size_bytes` > 20,000) but very little extracted text (`content_word_count` < 20) is flagged 'low' extraction confidence, which caps `substantively_thin_page`'s reported confidence at 'medium' rather than asserting a confident thin-content verdict. No headless rendering was added — documented as a standing limitation, not silently ignored.

**Implication for page-builder sites:** a page whose real content is injected client-side (rare for server-rendered WordPress/Elementor content, more plausible for heavily JS-driven SPA-style sites) will appear thin/low-word-count here regardless of what a browser would show. `getExtractionConfidence` only catches the case where HTML bytes and extracted text diverge sharply — it cannot catch a page that is ALSO small in raw HTML (e.g. a near-empty shell that hydrates client-side).

## 7. Page-purpose model

`lib/content/page-purpose.ts`'s `classifyPageType` — deliberately narrow: only `homepage` (structural fact, `depth === 0`, high confidence) and `contact` (requires the URL path AND at least one of title/H1 to independently agree — never URL alone) are classified with real confidence. Every other page (service, product, article, about, landing) returns `unknown` rather than a fragile guess, per this phase's own explicit "no fragile URL-only classification" instruction. Used only to set page-type-aware thin-content thresholds (§9) — not persisted as its own finding.

## 8. Full implemented finding/check list

| Check key | Kind | Category | Severity | Confidence | Actionability |
|---|---|---|---|---|---|
| `substantively_thin_page` | problem | thinness | medium | high/medium (page-type/extraction-aware) | guided_fix |
| `exact_duplicate_content` | problem | duplication | high | high | guided_fix |
| `highly_repetitive_page` | problem | duplication | medium | medium | guided_fix |
| `weak_content_structure` | problem | structure | low | high | guided_fix |
| `faq_opportunity` | **opportunity** | completeness | low | low | monitor |

5 checks — quality over quantity, consistent with every prior canonical engine's own precedent.

## 9. Deferred findings and why

- **`incomplete_service_content`** (missing dimensions like process/proof/next-step): explicitly deferred. Doing this deterministically without semantic/AI understanding would require exactly the fragile heuristics ("look for a heading literally named X") this phase's own instructions forbid treating as confident findings.
- **`near_duplicate_content`** (semantic/fuzzy similarity, not exact hash match): deferred per this phase's own explicit instruction ("implement exact fingerprints first and document semantic near-duplicate work as deferred"). A safe, bounded shingling/MinHash approach would need real design/validation work and risks O(n²) cost if done naively across 500 pages.
- **`stale_content`**: deferred — explicitly conditioned on "reliable date evidence," and no last-modified/publish-date evidence is currently persisted anywhere in `crawl_pages`.
- **`unclear_page_purpose`** as a customer-facing finding: the page-purpose classifier is used internally (§7) but not surfaced as its own finding — distinguishing "genuinely unclear purpose" from "our classifier just wasn't confident" is not reliably separable with current evidence, and conflating them risks confusing customers about whose limitation is whose.

## 10. Deterministic vs. AI-derived findings

Every V1 check's `evidence_source` is `'deterministic'`. No check emits `'ai_interpreted'` or `'hybrid'` in this initial implementation — see §11 for why, and `lib/content/types.ts`'s own doc comment for how the schema already supports all three without any future migration.

## 11. AI architecture

**No live AI interpretation was implemented in Phase 29.** This was a deliberate scope decision, not an oversight, made after inspecting the existing AI architecture (`lib/ai/client.ts`'s `generateAiCompletion` — a mature, well-designed, server-only Anthropic wrapper with timeouts, structured failure reasons, and prompt-injection defenses; `lib/ai/*-recommendation.ts` — per-field recommendation modules). Every existing use of this architecture is **on-demand, single-page, user-triggered** (a customer clicks "Prepare Fix" for one specific finding on one specific page). Phase 29's own instructions require the deterministic foundation to be built and validated FIRST, and frame AI as conditional throughout ("if implemented in Phase 29..."). Building a responsible BATCH AI analysis path (across up to 500 pages per crawl) safely requires its own cost-control/entitlement design (§12) that is itself substantial scope — attempting both in one phase risked a half-validated version of each. The finding model, persistence schema (`finding_kind`, `evidence_source`), and health formula are ALL already designed to accept AI-derived findings with zero migration or type changes once that work is scheduled.

## 12. AI cost-control strategy (for future implementation)

Inspected `lib/entitlements/plans.ts`: `PLAN_CAPABILITIES` already has a real per-plan `maxCrawlPages` (Free 30 / Bloom 150 / Bloom Pro 500) and an `aiFixesAllowed` boolean (currently `true` for all plans, already consumed by the existing per-page AI fix flows). A future AI content-interpretation pass should: (1) run the deterministic pass first (as this phase does) across all eligible pages; (2) select a BOUNDED subset for AI interpretation (e.g. only pages with an existing deterministic problem, or a fixed per-analysis cap); (3) key results by `content_hash` (already persisted) so an unchanged page never needs re-analysis on a subsequent crawl; (4) add a plan-aware AI-page-budget field to `PlanCapabilities` alongside the existing `aiFixesAllowed`/`maxCrawlPages` pattern rather than inventing a new entitlement mechanism. No pricing/limit numbers are invented here — this section documents the compatible architecture only.

## 13. Content hash / cache / reuse strategy

`content_hash` (crawl-time, sha256 of full normalized text) is the reuse key: identical hash across re-crawls means the page's substantive content has not changed, letting a future AI pass (or future competitor-comparison layer) skip re-analysis safely. This is exactly the "avoid re-analyzing unchanged content" mechanism this phase's own AI Cost Control section asks for, built now even without a live AI consumer yet.

## 14. Thin/incomplete content methodology

NOT `words < 300 => thin`. Page-type-aware thresholds (`lib/content/checks/thin-content.ts`): contact 40 words, homepage 60 words, unknown/every other type 150 words. Thresholds are never LOWERED for uncertainty — confidence is reduced instead (capped at 'medium' when page type is 'unknown' or extraction confidence is 'low'), per this phase's own explicit instruction.

## 15. Duplicate/near-duplicate methodology

`exact_duplicate_content` groups eligible pages by `content_hash` — O(n), safe at every crawl budget. Comparing NORMALIZED PARAGRAPH TEXT ONLY (never raw HTML) means two pages sharing a template but different substance never match. Pages below 10 words are excluded from grouping (already covered by thinness). Near-duplicate (fuzzy/semantic similarity) is explicitly deferred (§9).

## 16. Boilerplate handling

`lib/content/boilerplate.ts`: a normalized paragraph counts as boilerplate only if it appears on ≥40% of ALL eligible analyzed pages, with a minimum 5-page sample (mirrors Site Architecture's own `MIN_PAGES_FOR_PATTERN` precedent). No DOM/tag-structure inspection — paragraph TEXT only, so this works identically regardless of theme/page-builder. `highly_repetitive_page` fires when a page's OWN boilerplate ratio (of its own paragraphs, requiring ≥3 total) is ≥70% — genuinely different from `exact_duplicate_content` (one page byte-matching one specific other page).

## 17. Content completeness methodology

Implemented ONLY as the single, conservative `faq_opportunity` check (§8) — an OPPORTUNITY, never a problem, firing only on already-substantive pages (≥150 words) with no question-mark/FAQ-signal heading. No "every service page must contain X/Y/Z" hardcoding was implemented, per this phase's explicit prohibition.

## 18. Health vs. Opportunity model

The core product distinction this phase introduces. `FindingKind = 'problem' | 'opportunity'` (`lib/content/types.ts`). `lib/content/health.ts`'s `findingDeduction` checks `kind` FIRST — an `'opportunity'` finding contributes **exactly zero** to the deduction sum regardless of its own severity/confidence fields. Verified directly: `tests/content-health.test.ts`'s "CORE DISTINCTION" test constructs an opportunity with `severity: 'critical', affectedPageCount: 30` and confirms the score stays 100.

## 19. Finding/evidence model

Identical shape to every prior canonical engine's `RawFinding`/`AggregatedFinding` (checkKey/category/scope/severity/confidence/title/explanation/whyItMatters/recommendation/evidence/affectedPages, plus affectedPageCount/occurrenceCount/uniqueTargetCount/actionability), extended with `kind` and `evidenceSource`. Every finding names the exact affected URL(s) and observed values — no vague "content could be improved" findings (see e.g. `thin-content.ts`'s interpreted explanation text, matching this phase's own "webioom should interpret the evidence" example).

## 20. Actionability mapping

All four PROBLEM checks are `guided_fix` — no execution path anywhere in `lib/fixes/`/`lib/integrations/` can write arbitrary page BODY content to a connected platform (every existing AI/write capability is scoped to short single fields: title, meta description, H1, image alt). `faq_opportunity` is `monitor` (a suggestion, not a required action). No check is `safe_fix`/`prepared_fix` — verified against actual wired code, not assumed.

## 21. Scoring formula

Built on the same `lib/category-engine/health.ts` shared primitives On-Page SEO uses: `deduction = SEVERITY_DEDUCTION[severity] × CONFIDENCE_MULTIPLIER[confidence] × fractionSpread(affectedPageCount, totalAnalyzedPages)` for `kind === 'problem'` findings only; `0` for `kind === 'opportunity'`. Tier-capped and rounded once at the end, identical mechanism to every other engine.

## 22. Confidence behavior

High for directly-observed structural facts (paragraph/heading counts). Reduced to medium for thin-content specifically when page type is unknown or extraction confidence is low. `highly_repetitive_page` is always medium confidence (boilerplate classification is inherently a frequency heuristic). The shared `lib/category-engine/severity.ts` escalation rule (low-confidence caps at medium severity; high escalates to critical at ≥50% prevalence) applies unchanged.

## 23. Scope / site-size normalization

Identical `fractionSpread` mechanism to every other engine — verified directly in `tests/content-score-calibration.test.ts`'s site-size-normalization suite (same absolute affected-page count scores materially better on a 300-page site than a 10-page site).

## 24. Partial-crawl behavior

**No Content V1 check is suppressed on a partial crawl.** `substantively_thin_page`/`weak_content_structure`/`faq_opportunity` are page-local (fully known once that page is fetched). `exact_duplicate_content`/`highly_repetitive_page` describe only OBSERVED evidence among analyzed pages and can only UNDER-detect on a partial crawl (the safe direction), never wrongly over-claim — findings never claim site-wide completeness.

## 25. Calibration results

Built in `tests/helpers/content-synthetic-site.ts` (disjoint-offset mutators, learned directly from Phase 27/28's own documented fixture-overlap lesson) and exercised end-to-end through the real `analyzeContent` pipeline:

- **Excellent**: **100**.
- **Good** (2/40 pages minor-thin): **≥90**.
- **Moderate**: scores meaningfully below Good.
- **Poor**: scores meaningfully below Moderate, meaningfully above Severely Broken.
- **Severely Broken** (37.5% thin, 50% exact-duplicate [crossing the critical-escalation breakpoint], 12.5% highly repetitive): **<55**.

Strict descending order (Excellent > Good > Moderate > Poor > Severely Broken) asserted directly.

**A genuine, documented structural ceiling exists** (the identical conclusion Site Architecture's own Phase 27 score-calibration audit reached): with only 4 problem checks, none critical-by-default (only `exact_duplicate_content` can reach 'critical', via the shared widespread-escalation rule), the mathematical floor on how low a maximally-broken site can score is real — verified directly rather than asserted against an arbitrary target, and documented here rather than artificially lowered by inflating severities without evidence.

## 26. Monotonicity results

All hold, verified directly: adding a real problem never improves the score; fixing a problem never reduces it; an opportunity finding (even at maximum severity/prevalence) never reduces the score; increasing affected-page prevalence never improves the score; a 20-page duplicate-content group never collapses the score via combinatorial counting; re-running analysis on identical evidence reproduces the identical score; scaling the healthy population never worsens the score for a fixed absolute affected-page count.

## 27. Analyzer version

`content-v1` — the first-ever canonical Content Intelligence analyzer version.

## 28. Persistence architecture

`content_findings`/`content_finding_pages` (new tables, mirroring `on_page_findings`/`on_page_finding_pages`'s proven shape and RLS pattern, adding `finding_kind`/`evidence_source`), reusing `crawl_analyses` as-is. Five new `crawl_pages` columns (§4).

## 29. Migration

**`supabase/migrations/20261021000000_content_findings.sql`** — NOT applied. Adds the five `crawl_pages` content columns plus the two new tables.

## 30. Overview integration

New tile via the shared `CategoryEngineTile` component. The legacy generic `'content'` category (a raw word-count-only `low_text_content` check with no page-type awareness or duplication detection) is retired from the grid's remaining placeholder cards — never shown alongside canonical Content as a second, competing category, exactly mirroring how `'seo'` was retired in Phase 28.

## 31. Dedicated Content page

`/dashboard/websites/[id]/content` — score, severity badges, summary metrics (pages analyzed, content problems, content opportunities), then PROBLEMS and OPPORTUNITIES rendered as clearly separate sections (never mixed into one severity-sorted list) so a customer never mistakes an optional suggestion for something actively wrong.

## 32. Future Competitive Intelligence compatibility

No customer-specific assumptions are baked into the engine: `AnalyzerContext`/checks operate purely on `CrawlPageRow` + derived page-type/extraction-confidence, with no ownership/write-permission coupling anywhere in the analysis path (that lives entirely in the `*-actions.ts` layer, kept separate per this phase's own instruction). `content_hash`/`content_word_count`/`content_heading_texts`/page-type are all reusable, structured "content dimension" signals a future comparison layer could run identically against a customer site and a public competitor site. No competitor tables/UI were added.

## 33. Future Safe Fix 2.0 compatibility

Every finding already carries `actionability`, `remediation_type` (schema supports the existing `content_field_replacement` value added in Phase 28), and full affected-page evidence — a future body-content write path would plug into the exact same finding rows without any schema change; only `lib/content/actionability.ts`'s static classifications would need updating once (and if) a real execution backend exists.

## 34. Known limitations

No near-duplicate/semantic similarity detection. No heading-hierarchy-beyond-H2 analysis. Page-purpose classification is narrow (only homepage/contact; everything else is `unknown`). No AI interpretation. No stale-content detection (no date evidence persisted). Client-side-rendered content is invisible to this engine (§6). The V1 check set has a real, documented scoring floor (§25) given only 4 problem checks exist.

## 35. Deferred to Phase 30 / later

**Phase 30 Safe Fix 2.0:** any content-body write path; AI-generated proposed rewrites. **Unscheduled:** near-duplicate/semantic similarity; heading-hierarchy-beyond-H2 analysis; stale-content detection (needs new date evidence); Topical Coverage / Content Quality & Clarity (need external competitor/SERP or a materially larger semantic pass); Competitive Intelligence (§32 — hooks only, no functionality).

**NOTE (Phase 29 targeted completion pass, superseding several statements above):** §29's migration IS now applied, plus two further additive migrations exist (`20261028000000_content_v2_dimensions.sql`, applied; `20261104000000_content_analysis_coverage.sql`, NOT yet applied — see §36). §34's "narrow page-purpose (only homepage/contact)" and "No AI interpretation" are superseded by §36-§40 below. Analyzer version is now `content-v3`.

## 36. Real-world correction + 12-dimension architecture (content-v2, superseded by content-v3 below)

A fresh Bespoke crawl proved the original `<p>`-only extraction too narrow (visibly populated page-builder pages extracted to 0 substantive words). Root cause: body copy in `<div>` page-builder containers, never wrapped in `<p>`. Fixed via `lib/scanner/checks.ts`'s `getSubstantiveBlocks` — block-boundary extraction across `p/div/li/section/article/blockquote/tr/td/th/figcaption/dd/dt`, excluding `script/style/noscript/template/nav/header/footer`, with a new persisted `content_extraction_confidence` signal (`crawl_pages`) distinguishing "observed empty" from "insufficient extraction evidence" — pages with 'low' confidence are EXCLUDED from thin-content evaluation entirely, not merely softened. The complete, LOCKED 12-dimension report architecture (`lib/content/dimensions.ts`) was built: every dimension always returns one of healthy/findings/opportunities/limited_confidence/not_assessed, never a fabricated "Good." A deterministic+AI hybrid Content Completeness architecture was built (prompt-injection defended, structured-output validated, bounded page count) but deliberately left UNWIRED in production at that point.

## 37. Targeted completion pass (content-v3) — this is the CURRENT state

A second, genuinely fresh Bespoke crawl (`06ff14a8-81cb-47d2-9870-4872a5e6742f`) confirmed the block-based extractor is executing (30/36 pages with `content_word_count > 0`), but exposed further quality gaps a senior SEO/content review identified. All of the following shipped in this pass:

- **Chrome exclusion, broadened** (`lib/scanner/checks.ts`): `getSubstantiveBlocks` now also strips (a) `<aside>` (previously missing from the semantic-tag list), (b) the four WAI-ARIA landmark roles (`banner`/`navigation`/`contentinfo`/`complementary`) via a NEW depth-aware `stripBalancedRegions` helper — a naive non-greedy regex only stripped through the FIRST same-named nested closing tag, which under-stripped real multi-child page-builder header/nav `<div>`s; the new helper counts open/close depth to find the TRUE matching close, and (c) WCAG "skip to main content" bypass-block links (a universal accessibility idiom, not site-specific copy). Residual, disclosed limitation: a floating global CTA with no semantic/ARIA wrapper at all (e.g. a bare "Talk to an Expert" button outside any header/nav landmark) is NOT generically detectable without over-filtering legitimate short content — not solved this pass.
- **Page eligibility / template artifacts audited, no new exclusion added**: the existing `isEligibleContentPage`/`isContentEligiblePage` gate (2xx HTML, not noindex, self-canonical) is the full extent of reliable GENERIC evidence available; no further URL-shape/CMS-agnostic signal was found reliable enough to exclude page-builder template-preview URLs (`?wpr_templates=...`, `/elementor-hf/...`) without guessing — documented explicitly in `lib/content/checks/exact-duplicate.ts`.
- **Duplicate Content — honest V1** (`lib/content/dimensions.ts`, `lib/content/checks/exact-duplicate.ts`): a clean result is now `limited_confidence`, never `healthy` — exact-hash detection cannot see near-duplicate (e.g. templated) content, a real, common, disclosed blind spot. The finding now also carries group-level evidence (`duplicateGroupCount`, per-group URLs/size) and states its exact-match-only scope in its own explanation.
- **Page Purpose expanded** (`lib/content/page-purpose.ts`): `PageType` grew from `homepage | contact | unknown` to also include `about | service | product | article | category | landing | other`. `contact`/`about` require an exact URL path-segment match AND title/H1 corroboration (never URL alone); `service`/`product`/`article`/`category` classify from an exact URL path segment ALONE (a routing/IA convention, not incidental prose) — a bare listing root (`/services`, `/shop`, `/blog` with nothing after it) is `category`, a deeper path is the specific type. `landing`/`other` remain defined but unused — no reliable generic signal exists for them yet.
- **FAQ/Question Coverage fixed** (`lib/content/checks/faq-opportunity.ts`): the demonstrated false negative (any heading containing "?" suppressed the opportunity, including CTAs like "Ready to Grow Your Business?") is fixed — a heading now only counts as question-coverage evidence via an explicit FAQ-family term OR a grammatically genuine WH-question/auxiliary opening ("How much does this cost?"). Contact pages are excluded from consideration (Page Purpose now influences relevance).
- **Content Structure broadened** (`lib/content/checks/weak-structure.ts`): a second condition (`>= 400` words with zero H2 headings, any paragraph count) supplements the original extreme wall-of-text rule, which alone missed "many short paragraphs, zero sections" on long pages. Explicitly documented scope: paragraph/heading counts relative to length only — never writing quality or heading hierarchy (only H2s are persisted).
- **Content Completeness AI — now LIVE** (`app/dashboard/websites/[id]/content-actions.ts`): `interpretContentCompleteness` is passed as `analyzeContent`'s `completenessAiHook` in production. Per this pass's explicit release policy, EVERY AI-derived result — including the model's own self-reported 'high' confidence — is `kind: 'opportunity'` (zero Content Health impact); `content_completeness_gap` (the `kind: 'problem'` check key) remains schema-defined but is not produced by any code path in this release, pending an empirical accuracy track record.
- **Minimum-evidence gating** (`lib/content/dimensions.ts`): Content Structure and FAQ Coverage now report `not_assessed` (not a fabricated "healthy") when zero pages had enough substantive content (>= 150 words) to meaningfully evaluate at all, via a new `substantiveEligiblePageCount` field on the always-on `page_purpose_summary` finding's evidence.
- **Content Analysis Coverage — new concept** (`lib/content/coverage.ts`): a documented, deterministic formula (`50% extraction-confidence ratio + 50% dimensions-assessed ratio`) SEPARATE from Content Health, persisted alongside the analysis (`crawl_analyses.coverage`, new nullable JSONB column, additive migration — see §38) and shown on the dedicated Content page next to the score, so a high Health score can never visually imply comprehensive coverage.
- **Analyzer version bumped** `content-v2` -> `content-v3` (`lib/content/types.ts`) — every change above operates on already-persisted `crawl_pages` evidence except the chrome-exclusion fix, which requires a fresh crawl (raw HTML is never retained — see `lib/crawler/content-extract.ts`).

## 38. Migrations (current state)

- `20261021000000_content_findings.sql` — APPLIED.
- `20261028000000_content_v2_dimensions.sql` — APPLIED.
- `20261104000000_content_analysis_coverage.sql` — NOT applied. Adds one nullable `crawl_analyses.coverage jsonb` column (generic, shared table — every other category engine's rows simply leave it null). **Content re-analysis will fail (loudly, not silently — see the crawler persistence-hardening work) until this is applied**, since `saveAnalysis` now always writes to this column.
