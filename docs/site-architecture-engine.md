# Site Architecture & Internal Linking Engine 1.0 (Phase 27)

Answers: *"Is this website organized so users and search engines can easily discover, reach, and understand its important pages?"* — the RELATIONSHIPS between pages, as distinct from Technical SEO's own "can search engines crawl/index correctly" question. Follows the exact canonical-category-engine pattern Phase 26/26B established for Technical SEO: one persisted analysis, one score, one finding set, consumed identically by Overview's summary tile and this category's own dedicated detail page.

## 1. Engine contract

| Responsibility | Implementation |
|---|---|
| Score | `lib/architecture/health.ts`, persisted on `crawl_analyses.health_score` (analyzer_version = `site-architecture-v3`) |
| Findings | `architecture_findings` — one row per distinct, aggregated problem (`lib/architecture/aggregate.ts`) |
| Evidence | `architecture_finding_pages` — typed `current_state`/`desired_state` plus a `detail` JSONB escape hatch, reusing `lib/category-engine/types.ts`'s generic `StateValue`/`RawFindingPageEvidence` |
| Solution | `proposed_change` + `remediation_type` |
| Actionability | `lib/architecture/actionability.ts` — the same canonical five-value vocabulary Technical SEO uses |
| Verification | Re-analysis of a fresh crawl — a finding disappearing on the next analysis IS the verification |

Orchestration entry point: `lib/architecture/run-analysis.ts`'s `analyzeArchitecture(store, crawlRunId)`, invoked from `app/dashboard/websites/[id]/site-architecture-actions.ts`'s ownership-checked `analyzeArchitectureCrawlRun`. Idempotent (re-analysis replaces the prior `(crawl_run_id, analyzer_version)` result wholesale — verified by `tests/architecture-run-analysis.test.ts`), per-check isolated (one broken analyzer never discards another's findings).

## 2. Database

One new migration, `20261007000000_site_architecture_findings.sql`, additive only:
- **`crawl_analyses` is reused AS-IS** — no schema change there at all. It was already generic (keyed by `(crawl_run_id, analyzer_version)`, no category column tying it to Technical SEO). A Site Architecture analysis is simply another row with `analyzer_version = 'site-architecture-v3'`.
- **`architecture_findings`/`architecture_finding_pages`** — new tables, mirroring `technical_findings`/`technical_finding_pages`'s proven shape and RLS pattern exactly, but with their own category vocabulary and CHECK constraints. Kept separate from the Technical-SEO-named tables rather than widening their constraint again, so each category's findings stay independently reviewable.
- Neither `technical_findings`, `technical_finding_pages`, nor any Technical SEO row is touched.

## 3. Graph model (`lib/architecture/graph.ts`)

`buildPageGraph(evidence)` builds a deterministic, in-memory graph from Phase 25's already-persisted `crawl_pages`/`crawl_links` — no re-fetching, no new crawl evidence:

- `pages: Map<url, CrawlPageRow>`
- `inboundBySource: Map<targetUrl, Set<sourceUrl>>` — distinct internal-link sources per target
- `outboundByTarget: Map<sourceUrl, Set<targetUrl>>` — distinct internal-link targets per source
- `seedUrl` — the crawl's own depth-0 page

External links (`link_type !== 'internal'`) and self-links are excluded. `inboundCount`/`outboundCount`/`inboundSources`/`outboundTargets`/`isHomepage` are the only way a check queries the graph — no check walks `crawl_links` directly.

**`crawl_pages.depth` is reused as the observed crawl depth** rather than recomputing BFS distance — it is the crawler's own recorded shortest-path-found depth. One documented caveat: a sitemap-discovered page is always recorded at depth 1 regardless of true navigational depth (`lib/crawler/engine.ts`'s `startCrawlRun` seeds all sitemap URLs at depth 1), so the deep-page check explicitly excludes sitemap-discovered pages — this makes the check strictly conservative (it can only ever under-report), never a source of false positives.

## 4. Checks/findings implemented

| Check key | Category | Notes |
|---|---|---|
| `orphan_page` | orphan_pages | Zero inbound internal links, excludes homepage, **requires `isArchitectureEligiblePage`** (§14). In practice only ever fires for sitemap-discovered pages — a page discovered via 'link' structurally always has ≥1 inbound edge. **Suppressed entirely on a partial crawl.** |
| `deep_page` | link_depth | `depth >= 4` (documented threshold: home→section→subsection→item = depth 3 is normal; depth 4+ starts to indicate excessive click depth), excludes sitemap-discovered pages, **requires `isArchitectureEligiblePage`** (§14). Not suppressed on partial crawls (a page's own recorded depth is independent of crawl completeness). |
| `underlinked_page` | link_distribution | 1-2 distinct inbound links (deliberately narrower than orphan's 0), **requires `isArchitectureEligiblePage`** (§14). Phrased as an observation ("very few internal links"), never a false authority claim about business importance. **Suppressed on a partial crawl** (undercounts inbound links). |
| `internal_link_to_redirect_edge` | internal_link_health | Edge-specific: source → current target → final destination → proposed replacement, one instance per (source, target) edge (not deduplicated to one per target — the exact real-world ambiguity Phase 26B's Checkpoint 9 fixed for Technical SEO, applied here too). Edge-based — the TARGET's own eligibility is deliberately irrelevant (§14). |
| `internal_link_to_broken_edge` | internal_link_health | Edge-specific source → broken target → observed status. Never invents a replacement destination. Edge-based — same eligibility exemption as above. |
| `dead_end_page` | dead_ends | Zero outgoing internal links, **requires `isArchitectureEligiblePage`** (§14 — corrected from a plain "completed + HTML" check after a real-world review found utility/template endpoints qualifying as false-positive "dead ends"). Deliberately low severity/confidence and `monitor` actionability — very often intentional (a thank-you page, a form-only contact page). Not suppressed on partial crawls (a page's own outbound links are fully known once fetched). |
| `widespread_isolated_pages` | site_wide_consistency | ≥5 eligible pages, ≥20% isolated, population now `isArchitectureEligiblePage` pages (§14) rather than all completed pages. Severity is `critical` at ≥50% isolated, `high` below that (corrected by the calibration audit — see §13.2; previously fixed at `high` regardless of how extreme the ratio was). **Suppressed on partial crawls** (depends on orphan detection). |
| `internal_link_opportunity` | link_opportunities | Reserved key, **zero instances emitted in this phase** — see §8. |

**34 → 8 checks** is deliberately smaller than Technical SEO's catalog — Checkpoint C's own instruction was to prioritize high-confidence, deterministic checks over vanity coverage; "weakly connected site sections" clustering was evaluated and explicitly deferred (§9) rather than faked.

## 5. Health score formula

`lib/architecture/health.ts` — the SAME general deduction model as Technical SEO (`deduction = SEVERITY_DEDUCTION[severity] × CONFIDENCE_MULTIPLIER[confidence] × spread`, summed per severity tier, each tier capped before subtracting from 100), computed and persisted independently. Reusing the shape (not the module) was a deliberate choice, not blind copying — see `docs/category-score-standard.md` for the general standard this formula is checked against.

**Corrected by the Phase 27 score-calibration audit (§13 below).** `spread` is now `max(pageFraction(affectedPageCount), pageFraction(occurrenceCount))`, both measured as a fraction of `totalAnalyzedPages` — not `pageFraction(affectedPageCount)` alone. The audit found the original, page-fraction-only spread was blind to raw occurrence count for the two edge-based checks: a hub page with 1 broken link and the same hub page with 200 broken links produced an IDENTICAL deduction, since both have `affectedPageCount = 1`. See `lib/architecture/health.ts`'s own doc comment for the full before/after reasoning and `tests/architecture-health.test.ts`'s "occurrence-aware spread" tests for the locked-in behavior. For the four page-level-only checks (orphan/deep/underlinked/dead-end), `occurrenceCount` always equals `affectedPageCount` by construction, so this correction is a strict no-op for them.

`explainArchitectureHealth` (same module) reconstructs the exact per-finding deduction breakdown from already-persisted finding fields (severity/confidence/scope/affected_page_count/occurrence_count) — no new column was needed. See §13.4.

## 6. Partial crawl behavior (major acceptance criterion)

| Check | Partial-crawl behavior | Why |
|---|---|---|
| `orphan_page` | **Suppressed** | A missing inbound link could simply mean the linking page wasn't crawled yet — never claim orphan under that uncertainty. |
| `underlinked_page` | **Suppressed** | Same reasoning — inbound counts are systematically undercounted on a partial crawl. |
| `widespread_isolated_pages` | **Suppressed** | Depends on orphan detection. |
| `deep_page` | **Not suppressed** | A page's own recorded depth doesn't change based on unrelated pages being uncrawled. |
| `internal_link_to_redirect_edge` / `internal_link_to_broken_edge` | **Not suppressed** | Both the edge and the target's fetch status are directly observed facts, independent of the rest of the graph. |
| `dead_end_page` | **Not suppressed** | A page's own outbound links are fully known once its HTML was fetched. |

The dedicated page displays an explicit notice when `crawl_runs.status === 'partial'`, naming exactly which findings are withheld and why, and the score/counts always reflect only the analyzed evidence — never extrapolated.

## 7. Cross-category ownership (Section L)

Internal links to redirected/broken targets are evidence BOTH Technical SEO and Site Architecture legitimately care about — this is not accidental duplication:

- **Technical SEO** (`internal_link_to_redirected_url` / `internal_link_to_broken_url`) frames the fact around the TARGET RESOURCE's own crawlability/indexability — is this URL healthy for search engines?
- **Site Architecture** (`internal_link_to_redirect_edge` / `internal_link_to_broken_edge`) frames the identical fact around the NAVIGATION GRAPH EDGE — does clicking through your site's own internal links waste a hop or hit a dead end?

Both checks' recommendations converge on the same action (point the link directly at the final/working destination) — a coherent recommendation viewed from two angles, never a contradiction. Each category's own dedicated page shows its own framing; a future combined view (out of scope for this phase) could de-duplicate the underlying evidence for display if that proves useful.

## 8. Remediation/actionability

Every check classifies as `guided_fix`, `developer_required`, or `monitor` — **never** `safe_fix`/`prepared_fix` (`tests/architecture-actionability.test.ts` asserts this globally). No current platform integration can safely rewrite an internal link's href, restructure navigation, or insert a link through a preview → approval → constrained write → verify → undo path. `dead_end_page` is specifically `monitor` given its high false-positive rate (often intentional).

## 9. Internal-link opportunities: now vs. deferred

**Built now (the foundation):** `internal_link_opportunity` exists as a reserved `CheckKey` and actionability entry; `RemediationType`/`StateValue`/`RawFindingPageEvidence` already support everything an opportunity needs to express (current: "no link exists" → desired: "suggested link," `proposedChange` for the anchor/destination). `lib/architecture/link-opportunities.ts`'s `analyzeLinkOpportunities()` is wired into the analyzer pipeline and returns `[]`.

**Deferred to Content Intelligence / Safe Fix 2.0:** ANY actual opportunity generation. Phase 25's crawler persists only title/meta description/first H1/canonical — never full page body text or per-paragraph context. Generating "on page A, near this sentence, link to page B" responsibly requires semantic content understanding this phase's evidence cannot honestly support. Building it now would mean fabricating relevance, which this phase's own instructions explicitly forbid.

## 10. Deferred entirely (Checkpoint C.7)

"Weakly connected site sections" / structural clustering was evaluated and NOT implemented — it would require a clustering or community-detection approach this phase has not built or validated, and this phase's instructions explicitly forbid faking "architecture quality" claims. `widespread_isolated_pages` (§4) is the one deterministic, clearly-defensible site-wide signal implemented instead.

## 11. What "Site Architecture category complete" still requires later

- Real internal-link opportunity generation (needs Content Intelligence's semantic evidence).
- Any Safe Fix execution path (`safe_fix`/`prepared_fix` for any check) — requires a real, constrained write capability on a connected platform, none of which exist for internal-link restructuring today.
- Structural clustering / section-level connectivity analysis, if a reliable deterministic approach is ever validated.
- Monitoring/change detection (explicitly out of scope for this phase, as for Technical SEO).

## 12. Known tech debt

`lib/architecture/aggregate.ts` intentionally duplicates `lib/technical-seo/aggregate.ts`'s orchestration logic (grouping, severity/confidence merging, instance dedup) rather than being generified — the underlying types differ enough per engine (`CheckKey`/`FindingCategory` closed unions) that a generic extraction would require touching Technical SEO's already-proven, tested code under this phase's time constraints. A genuine candidate for extraction into `lib/category-engine/` once a THIRD category engine needs the identical orchestration, not before (see `docs/category-engine-contract.md`).

## 13. Score-calibration audit (post-implementation correction)

A dedicated audit was performed after initial implementation, specifically to determine whether the score is genuinely accurate rather than just internally consistent. Full standard: `docs/category-score-standard.md`. Summary of findings and what changed:

### 13.1 Root-cause finding: occurrence-blindness in edge-based checks

The original `spread` calculation used only `affectedPageCount` (distinct SOURCE pages). For `internal_link_to_redirect_edge`/`internal_link_to_broken_edge`, this meant a single hub page with 1 broken link and the same hub page with 200 broken links scored IDENTICALLY (`affectedPageCount = 1` either way), because `occurrenceCount` (total distinct edges) was persisted but never fed into the deduction. **Corrected**: `spread = max(pageFraction(affectedPageCount), pageFraction(occurrenceCount))` — see §5.

### 13.2 Root-cause finding: widespread_isolated_pages severity could not scale

As a `scope: 'site'` finding with an empty `affectedPages` array (there is no natural "affected page list" for a whole-site statistic), this check's severity could never benefit from the shared widespread-escalation rule (`lib/category-engine/severity.ts`, which keys off `affectedPageCount` — always 0 here) NOR from the health module's own spread multiplier (site-scoped findings always use `spread = 1`). The result: a site with 21% isolated pages and one with 95% isolated pages scored identically. **Corrected**: `baseSeverity` is now `critical` at ≥50% isolated, `high` below that — computed directly from the observed ratio in `lib/architecture/checks/site-wide.ts`, since the shared mechanisms structurally could not reach this check.

### 13.3 Structural ceiling: only 7 real checks bound the maximum possible deduction

With 7 possible checks (`internal_link_opportunity` never fires), even every check firing simultaneously at maximum severity/confidence/spread could not, before the corrections above, push a score meaningfully below the low-40s — an inherent ceiling effect distinct from any single check's own miscalibration, and part of why a real, badly-organized site could plausibly still show a deceptively high score. The occurrence-awareness and severity-scaling corrections materially lower this ceiling (verified: a synthetic severely-broken fixture now scores below 50, versus 71 under the uncorrected model on an equivalent fixture — see `tests/architecture-score-calibration.test.ts`). No new checks were added merely to raise the ceiling further — Checkpoint C's "do not optimize for vanity check count" instruction was treated as binding here too; 7 well-evidenced checks remains the honest V1 catalog (§4/§10).

### 13.4 Score explainability added

`explainArchitectureHealth` (`lib/architecture/health.ts`) reconstructs the exact per-finding deduction breakdown — severity tier, confidence, computed spread, raw deduction — from data already persisted on `architecture_findings` rows (`severity`/`confidence`/`scope`/`affected_page_count`/`occurrence_count`). No new column was required. `tests/architecture-score-explainability.test.ts` verifies it against `calculateArchitectureHealth`'s own score.

### 13.5 Partial-crawl re-audit (dead_end_page specifically)

Traced through `lib/crawler/engine.ts`'s `processOnePage`: a page's outbound-link extraction and `crawl_links` insertion happen atomically as part of processing THAT page, before the crawl-level budget check that can mark the overall run `partial`. A `completed` page's own outbound-link evidence is therefore always fully captured regardless of whether OTHER pages were later cut off — confirming (not just asserting) that `dead_end_page` is safe to evaluate on a partial crawl. No change made; the existing behavior was already correct, and this audit is now recorded as the reasoning behind it rather than an unverified claim.

### 13.6 Score semantics (Step 8)

**Site Architecture Health measures the structural health observed within webioom's analyzed crawl scope, using the architecture checks supported by the current analyzer version (`site-architecture-v3`), evaluated only over pages that meaningfully participate in the site's navigable information architecture (see §14 below).** It does NOT imply universal SEO quality, business importance, ranking potential, content quality, backlink authority, or complete-site certainty when the underlying crawl is partial. The Overview tile and dedicated page both display an explicit "Partial" indicator whenever `crawl_runs.status === 'partial'`, so a score is never presented without its scope being visible alongside it. `healthLabel`'s existing thresholds (Excellent ≥90, Good ≥75, Needs Attention ≥50, Poor <50 — `lib/scanner/health-label.ts`) were reviewed and left unchanged; no evidence was found to justify a Site-Architecture-specific relabeling, and changing a shared label used by every category tile without cause would itself violate this phase's "do not change shared labels unless necessary" instruction.

### 13.7 Calibration test coverage added

`tests/architecture-score-calibration.test.ts` (controlled tiers A-E with strict ordering, mutation monotonicity, site-size normalization), `tests/architecture-score-explainability.test.ts`, `tests/health-label.test.ts` (previously untested shared boundaries), plus new correction-specific cases in `tests/architecture-health.test.ts` and `tests/architecture-site-wide.test.ts`. A genuine fixture-authoring bug was caught and fixed DURING this work (see `tests/helpers/architecture-synthetic-site.ts`'s own doc comment) — composing multiple mutation types on overlapping page ranges caused them to cancel each other out, which itself validated the audit process: it is exactly the kind of "looks fine, is actually wrong" failure mode this whole exercise exists to catch, just caught in test fixtures rather than production scoring this time.

## 14. Real-world evidence-quality pass (Bespoke 94/100 review)

Triggered by a real `site-architecture-v2` analysis of the Bespoke website scoring 94/100 on a partial 30-page crawl, with a 237-occurrence redirect-edge finding and two `?wpr_mega_menu=...` WordPress query-string endpoints showing up as "dead end" candidates. Full trace below; `docs/category-score-standard.md` is unchanged by this pass (no new standard property was needed — this was a coverage/eligibility gap, not a standard violation).

### 14.1 Why 237 redirect occurrences (Part A)

Traced end to end: `lib/scanner/url-utils.ts`'s `extractInternalLinks` already deduplicates hrefs PER PAGE via a `Set` — the same href appearing twice in one page's own DOM (e.g. both a header and footer instance of the identical link) never produces two `crawl_links` rows for that page. The 237 occurrences are therefore genuinely 237 distinct (source page, target URL) edges — one row per page that contains a link to a redirecting target, not artifacts of intra-page duplication. With 26 affected pages and 19 unique redirecting targets, an average of ~9.1 distinct redirecting targets per affected page is consistent with a shared site-wide navigation/footer template repeating a stable set of non-canonical (missing-trailing-slash) links across nearly every page (26 of 30, 87%) — a template-amplification pattern (Part B's "Case C"), not 237 unrelated content-level relationships. `affectedPageCount` (distinct sources), `occurrenceCount` (distinct edges), and `uniqueTargetCount` (distinct targets) are computed correctly and represent genuinely different dimensions (`lib/architecture/aggregate.ts`); trailing-slash behavior is correct and intentional — `lib/scanner/url-utils.ts`'s `normalizeUrl` strips trailing slashes when computing the crawler's own URL identity (`crawl_pages.url`/link `target_url`), while `final_url` is stored RAW from the actual fetch/redirect chain (`lib/crawler/engine.ts`: `final_url: result.finalUrl`, never renormalized) — this asymmetry is exactly what makes a pure trailing-slash 301 detectable as `final_url !== url` in the first place, not a bug.

### 14.2 Intrinsic severity vs. prevalence (Part B/C)

`baseSeverity: 'low'` for `internal_link_to_redirect_edge` remains defensible: a trailing-slash/canonicalization redirect is genuine but low-impact hygiene, identical in kind whether it appears once or hundreds of times. Prevalence is already handled, deliberately NOT via severity escalation — `lib/category-engine/severity.ts` documents "no automatic de-escalation OR escalation by count" for low/medium findings as an intentional, shared rule (also governing Technical SEO), and this task's own instruction explicitly forbids escalating low → high on occurrence count alone. Prevalence instead scales the DEDUCTION via `combinedSpread` (§5): for Bespoke's actual numbers (26/30 pages, 237/30 "occurrence fraction," both far past the 50% breakpoint) the spread hits its ceiling of 1.5×, giving `3 (low) × 1 (high confidence) × 1.5 = 4.5` points — the maximum any single low-severity, high-confidence finding can ever deduct, regardless of how many pages or occurrences beyond that ceiling. This satisfies both stated anti-goals: it is capped, not raw-multiplied (repeated header/footer links cannot destroy the score — case C and case D above would deduct identically, which is correct, since a visitor experiences the same number of unnecessary hops either way regardless of how many distinct templates caused them), and it is non-zero/visible (30% of the entire low-severity tier's 15-point budget from one finding). **No scoring formula change was needed here** — verified adequate, not assumed adequate.

`uniqueTargetCount` (19) was considered as a further scoring input (to distinguish template-concentrated Case C from content-spread Case D) and deliberately NOT added to the deduction — see `lib/architecture/health.ts`'s own doc comment for why: it reflects fix EFFORT (how many root causes), not current graph DEGRADATION (how many hops visitors/crawlers experience today), and using it to move the score would require template-recognition inference this evidence cannot honestly support (this task's own Part C instruction: "if exact template recognition is impossible... do not invent it"). It is instead threaded through to `explainArchitectureHealth`'s output (§14.4) for human/support explainability only.

### 14.3 Page eligibility (Parts D-G)

**Before this task:** no eligibility concept existed at all. Every `orphan_page`/`underlinked_page`/`dead_end_page`/`deep_page` check treated any `crawl_pages` row with `status === 'completed'` (plus, for `dead_end_page` only, an HTML-like content type) as an equally legitimate content page — no check verified `http_status` was actually in the 2xx range, `noindex`, or canonical self-reference.

**Why the WPR mega-menu URLs became dead-end candidates (Part G):** traced discovery → persistence → graph → check eligibility → finding. `lib/crawler/url-policy.ts`'s `normalizeCrawlUrl` deliberately keeps every query parameter not on its small tracking-parameter denylist (its own doc comment: "a query string can legitimately select different content... never stripped by default" — a conservative, general, already-correct policy, not a bug), and `isCrawlablePageUrl` only excludes known asset extensions, not query-only URLs — so a mega-menu widget's own `<a href="?wpr_mega_menu=...">` becomes a genuine, distinct `crawl_pages` row by design. If that fetch returns 200 HTML with no further internal links (typical of a menu/widget fragment endpoint), it satisfied every check's OLD eligibility bar (`completed` + HTML) and surfaced as a "dead end." The defect was never in discovery — it was the complete absence of an eligibility concept at the check layer.

**General rule implemented** (`lib/architecture/eligibility.ts`'s `isArchitectureEligiblePage`) — deliberately contains NO URL-pattern/CMS-specific logic (no path or query-string inspection anywhere): a page is an eligible architectural destination only if its own evidence affirmatively supports it — (1) fetched successfully as HTML in the 2xx range, (2) not `noindex`, (3) self-canonicalizes (no canonical tag, or one pointing back at its own URL). Conservative and keep-by-default per this task's own instruction: a page fails eligibility only when its OWN persisted evidence says so; an ordinary query-string page with no noindex and no cross-canonical remains fully eligible. Whether Bespoke's two actual mega-menu URLs specifically carried `noindex` or a cross-canonical cannot be confirmed from this repository (no live Supabase access in this environment) — confirming the exact mechanism for that specific site requires inspecting those two URLs' persisted `crawl_pages.noindex`/`crawl_pages.canonical_url`/`crawl_pages.http_status` values in the running application's database (§14.6).

**Verifying normal pages are not suppressed:** `/services/digital-marketing/digital-marketing-onboarding` and `/solutions` — ordinary content pages with no reason to fail any of the three eligibility conditions (successfully fetched HTML, not noindexed, self-canonical) — remain fully eligible under this rule; `tests/architecture-eligibility.test.ts` asserts this directly with fixtures mirroring exactly this shape (a normal page retained, a noindexed/cross-canonical utility page excluded).

### 14.4 Check-specific application (Part F) and score explainability (Part I)

| Check | Eligibility applies to | Reasoning |
|---|---|---|
| `orphan_page`, `underlinked_page` | The page being evaluated as (potentially) orphaned/underlinked | These claim something about a page's OWN standing in the architecture — that claim requires the page to actually be an architectural destination. |
| `dead_end_page`, `deep_page` | The page being evaluated | Same reasoning — "no exit" or "hard to reach" is meaningless for a resource nobody was meant to browse to. |
| `widespread_isolated_pages` | The population underlying the isolation ratio | Kept consistent with `orphan_page`'s own population — utility pages should not be able to manufacture or dilute a site-wide isolation signal. |
| `internal_link_to_redirect_edge`, `internal_link_to_broken_edge` | **Not applied — deliberately unchanged** | These are edge-based: the finding is about the LINK RELATIONSHIP itself (a real page really does link through a redirect, or to a broken URL), which remains true and worth surfacing regardless of whether the target happens to be an eligible destination page. |

The link GRAPH itself (`lib/architecture/graph.ts`) is unchanged — eligibility gates which pages are candidate SUBJECTS for a finding, never which links count toward another page's inbound/outbound totals. A genuine link from or to an ineligible page still counts exactly as observed.

`HealthFindingInput`/`HealthDeductionExplanation` (`lib/architecture/health.ts`) now carry `uniqueTargetCount` alongside the existing `affectedPageCount`/`occurrenceCount`, so `explainArchitectureHealth`'s output can fully reconstruct a breakdown in this shape without any new persisted column:

```
Redirected internal links
- intrinsic severity: Low
- 26 affected pages, 19 unique targets, 237 occurrences
- resulting deduction: 4.5
```

### 14.5 Score impact, analyzer version, and false-positive/negative risk

No scoring FORMULA change was made (§14.2) — only WHICH PAGES are eligible SUBJECTS for four page-level checks and one site-wide check changed. This is still a **finding-eligibility** change per this task's own Part J criterion, so the analyzer version is bumped `site-architecture-v2` → `site-architecture-v3` (`lib/architecture/types.ts`); any existing v2 row is left untouched as dormant history exactly as the v1 → v2 bump did. The score remains deterministic, bounded, monotonic, proportional, severity-aware, scope-aware, duplicate-resistant, and explainable — verified by the full existing calibration suite (§13.7) plus new eligibility-specific cases (`tests/architecture-eligibility.test.ts`).

**False-positive risk remaining:** a genuinely eligible page that happens to be intentionally noindexed for reasons unrelated to being a utility endpoint (e.g. a legitimate landing page temporarily noindexed during a campaign) is now excluded from orphan/underlinked/dead-end/deep-page consideration even though a human might still consider it part of the site's architecture — an accepted, documented trade-off in the conservative direction the task requested (excluding on an explicit, affirmative signal, never guessing).

**False-negative risk remaining:** a utility/template endpoint that carries neither `noindex` nor a cross-canonical (many WordPress AJAX/widget endpoints emit neither) is NOT excluded by this rule and will continue to participate in these checks — per this task's own explicit instruction ("if webioom cannot confidently exclude a resource, prefer keeping it"), this is treated as correct, honest behavior given current evidence rather than a residual bug; closing it further would require inventing a signal the crawl does not actually persist.

### 14.6 Bespoke re-analysis required

The Bespoke website's recorded 94/100 was computed under `site-architecture-v2`, before this task's eligibility correction. It should be treated as **superseded, not necessarily wrong** — this repository has no live Supabase access, so it cannot be confirmed whether Bespoke's actual crawl evidence contains pages that would be excluded under the new eligibility rule beyond the two `dead_end_page` examples already reported (which were LOW severity/LOW confidence, contributing only ~1.2 of the 4.5+1.2=5.7-point total deduction that produced 94 — see the Phase 27 score-calibration report's own worked computation). **The Bespoke site must be re-analyzed** under `site-architecture-v3` to get a number reflecting the corrected eligibility model; what a live inspection should confirm afterward: the new `architecture_findings` row's `dead_end_page` `affected_page_count` (should drop from 4 toward 2 if the mega-menu URLs are excluded and the two normal-looking pages remain, or drop further if evidence shows those two normal pages also fail eligibility for a reason not yet anticipated here), and whether the `crawl_pages` rows for the two mega-menu URLs specifically show `noindex = true` and/or a cross-canonical (confirming which signal excluded them) or neither (meaning they remain — and should remain, per §14.3's false-negative note — included going forward).
